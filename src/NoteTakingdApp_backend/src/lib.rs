use candid::{CandidType, Decode, Deserialize, Encode, Principal};
use ic_cdk::{call, export_candid, query, update};
use num_traits::ToPrimitive;
use ic_stable_structures::{
    memory_manager::{MemoryId, MemoryManager, VirtualMemory},
    storable::{BoundedStorable, Storable},
    StableBTreeMap, DefaultMemoryImpl,
};
use std::{borrow::Cow, cell::RefCell};

#[derive(Clone, PartialEq, Eq, PartialOrd, Ord)]
struct StorablePrincipal(Principal);

impl Storable for StorablePrincipal {
    fn to_bytes(&self) -> Cow<[u8]> {
        Cow::Owned(self.0.as_slice().to_vec())
    }

    fn from_bytes(bytes: Cow<[u8]>) -> Self {
        Self(Principal::from_slice(&bytes))
    }
}

impl BoundedStorable for StorablePrincipal {
    const MAX_SIZE: u32 = 29;
    const IS_FIXED_SIZE: bool = false;
}

impl Default for StorablePrincipal {
    fn default() -> Self {
        Self(Principal::anonymous())
    }
}

#[derive(Clone, Debug, CandidType, Deserialize)]
struct Note {
    title: String,
    content: String,
}

impl Storable for Note {
    fn to_bytes(&self) -> Cow<[u8]> {
        Cow::Owned(Encode!(self).unwrap())
    }

    fn from_bytes(bytes: Cow<[u8]>) -> Self {
        Decode!(&bytes.as_ref(), Self).unwrap()
    }
}

impl BoundedStorable for Note {
    const MAX_SIZE: u32 = 1024;
    const IS_FIXED_SIZE: bool = false;
}

type Memory = VirtualMemory<DefaultMemoryImpl>;

thread_local! {
    static MEMORY_MANAGER: RefCell<MemoryManager<DefaultMemoryImpl>> = RefCell::new(
        MemoryManager::init(DefaultMemoryImpl::default())
    );

    static NOTES_MAP: RefCell<StableBTreeMap<(StorablePrincipal, u64), Note, Memory>> = RefCell::new(
        StableBTreeMap::init(
            MEMORY_MANAGER.with(|mm| mm.borrow().get(MemoryId::new(0)))
        )
    );
}

// --- Ledger Related Structs ---
#[derive(CandidType, Deserialize)]
struct Account {
    owner: Principal,
    #[serde(skip_serializing_if = "Option::is_none")]
    subaccount: Option<Vec<u8>>,
}

#[derive(CandidType, Deserialize)]
struct TransferArg {
    from_subaccount: Option<Vec<u8>>,
    to: Account,
    amount: Nat,               
    fee: Option<Nat>,          
    memo: Option<Vec<u8>>,
    created_at_time: Option<u64>,
}


#[derive(CandidType, Deserialize)]
enum TransferResult {
    Ok(u64),
    Err(TransferError),
}

#[derive(CandidType, Deserialize, Debug)]
enum TransferError {
    InsufficientFunds { balance: u64 },
    BadFee { expected_fee: u64 },
    TxTooOld { allowed_window_nanos: u64 },
    CreatedInFuture,
    Duplicate { duplicate_of: u64 },
    TemporarilyUnavailable,
    GenericError { error_code: u64, message: String },
}

const LEDGER_CANISTER_ID: &str = "uxrrr-q7777-77774-qaaaq-cai";
const COST_PER_NOTE: u64 = 10_000; // Matches transfer_fee

// ---- Helper Functions ----

async fn check_balance(user: Principal) -> Result<u64, String> {
    let account = Account { owner: user, subaccount: None };

    let (balance_nat,): (Nat,) = call(
        Principal::from_text(LEDGER_CANISTER_ID).unwrap(),
        "icrc1_balance_of",
        (account,),
    )
    .await
    .map_err(|e| format!("Ledger call failed: {:?}", e))?;

    let balance_u64 = balance_nat.0.to_u64().ok_or("Balance too large for u64")?;

    Ok(balance_u64)
}


use candid::Nat;

async fn charge_user(user: Principal, amount: u64) -> Result<u64, String> {
    let to_account = Account {
        owner: Principal::from_text("uzt4z-lp777-77774-qaabq-cai").unwrap(), // Backend's principal
        subaccount: None,
    };

    let transfer_arg = TransferArg {
        from_subaccount: None,
        to: to_account,
        amount: amount.into(),               
        fee: Some(Nat::from(10_000u64)),     
        memo: None,
        created_at_time: None,
    };

    let result: (TransferResult,) = call(
        Principal::from_text(LEDGER_CANISTER_ID).unwrap(),
        "icrc1_transfer",
        (transfer_arg,),
    )
    .await
    .map_err(|e| format!("Transfer failed: {:?}", e))?;

    match result.0 {
        TransferResult::Ok(tx_id) => Ok(tx_id),
        TransferResult::Err(e) => Err(format!("Charge failed: {:?}", e)),
    }
}

// ---- Canister Functions ----

#[update]
async fn add_note(key: u64, value: Note) -> Result<Note, String> {
    let user = ic_cdk::caller();
    let balance = check_balance(user).await?;

    if balance < COST_PER_NOTE {
        return Err("Insufficient token balance.".into());
    }

    charge_user(user, COST_PER_NOTE).await?;

    let note = Note {
        title: value.title,
        content: value.content,
    };

    NOTES_MAP.with(|notes| {
        notes.borrow_mut().insert((StorablePrincipal(user), key), note.clone());
    });

    Ok(note)
}

#[update]
fn update_note(key: u64, value: Note) -> Option<Note> {
    let note = Note {
        title: value.title,
        content: value.content,
    };

    NOTES_MAP.with(|notes| {
        notes.borrow_mut().insert((StorablePrincipal(ic_cdk::caller()), key), note.clone());
        Some(note)
    })
}

#[query]
fn get_note(id: u64) -> Option<Note> {
    NOTES_MAP.with(|notes| {
        notes.borrow().get(&(StorablePrincipal(ic_cdk::caller()), id)).clone()
    })
}

#[query]
fn list_notes() -> Vec<(u64, Note)> {
    NOTES_MAP.with(|notes| {
        notes
            .borrow()
            .iter()
            .filter_map(|((owner, id), note)| {
                if owner.0 == ic_cdk::caller() {
                    Some((id, note.clone()))
                } else {
                    None
                }
            })
            .collect()
    })
}

#[update]
fn delete_note(id: u64) -> Result<String, String> {
    let key = (StorablePrincipal(ic_cdk::caller()), id);

    NOTES_MAP.with(|notes| {
        let mut notes = notes.borrow_mut();
        if notes.contains_key(&key) {
            notes.remove(&key);
            Ok(format!("Note {} deleted.", id))
        } else {
            Err(format!("Note {} not found or not yours.", id))
        }
    })
}

export_candid!();
