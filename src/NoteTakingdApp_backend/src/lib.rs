use candid::{CandidType, Decode, Deserialize, Encode, Principal, Nat};
use ic_cdk::{call, export_candid, query, update};
use crate::call::Call;
use num_traits::ToPrimitive;
use ic_stable_structures::{
    memory_manager::{MemoryId, MemoryManager, VirtualMemory},
    storable::{BoundedStorable, Storable},
    StableBTreeMap, DefaultMemoryImpl,
};
use std::{borrow::Cow, cell::RefCell};
use ic_cdk::api::msg_caller;
use icrc_ledger_types::icrc1::account::Account;
use icrc_ledger_types::icrc1::transfer::NumTokens;
use icrc_ledger_types::icrc2::transfer_from::{TransferFromArgs, TransferFromError};
use serde::Serialize;
use ic_cdk::api::management_canister::http_request::{
    http_request,
    HttpResponse,
    CanisterHttpRequestArgument,
    HttpMethod,
    HttpHeader,
    TransformContext,
    TransformFunc,
    TransformArgs,
};
use candid::Func;use std::str;

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

fn transform(args: TransformArgs) -> HttpResponse {
    HttpResponse {
        status: args.response.status,
        body: args.response.body,
        headers: vec![], // strip all headers
    }
}

#[derive(CandidType, Deserialize, Serialize)]
pub struct TransferArgs {
    amount: NumTokens,
    to_account: Account,
}

#[derive(CandidType, Deserialize)]
enum TransferResult {
    Ok(u64),
    Err(TransferFromError),
}

const LEDGER_CANISTER_ID: &str = "uxrrr-q7777-77774-qaaaq-cai";
const COST_PER_NOTE: u64 = 10_000;
const PROFIT_PER_NOTE: u64 = 5_000; // Profits fees
const ETH_RECEIVER_ADDRESS: &str = "0x9f8b9dE0b67BCe8d03B9A521F8dAF3dcc0E1f5A5";
const BACKEND_CANISTER: &str = "uzt4z-lp777-77774-qaabq-cai";
const DEX_CANISTER_ID: &str = "dwahc-eyaaa-aaaag-qcgnq-cai";
const CKETH_CANISTER_ID: &str = "ss2fx-dyaaa-aaaar-qacoq-cai";

async fn check_balance(user: Principal) -> Result<u64, String> {
    let account = Account { owner: user, subaccount: None };

    let (balance_nat,): (Nat,) = ic_cdk::api::call::call(
        Principal::from_text(LEDGER_CANISTER_ID).unwrap(),
        "icrc1_balance_of",
        (account,),
    )
    .await
    .map_err(|e| format!("Ledger call failed: {:?}", e))?;

    let balance_u64 = balance_nat.0.to_u64().ok_or("Balance too large for u64")?;

    Ok(balance_u64)
}

async fn charge_user(_user: Principal, amount: u64) -> Result<u64, String> {
    let to_account = Account {
        owner: Principal::from_text("uzt4z-lp777-77774-qaabq-cai").unwrap(), // Backend's principal
        subaccount: None,
    };

    let transfer_from_arg = TransferFromArgs {
        from: Account {
            owner: msg_caller(),
            subaccount: None,
        },
        to: to_account,
        amount: Nat::from(amount),
        spender_subaccount: None,
        fee: Some(Nat::from(10_000u64)),
        memo: None,
        created_at_time: None,
    };

    let result: (Result<Nat, TransferFromError>,) = ic_cdk::api::call::call(
        Principal::from_text(LEDGER_CANISTER_ID).unwrap(),
        "icrc2_transfer_from",
        (transfer_from_arg,),
    )
    .await
    .map_err(|e| format!("Transfer failed: {:?}", e))?;

    match result.0 {
        Ok(tx_id_nat) => tx_id_nat.0.to_u64().ok_or("Tx ID too large".into()),
        Err(e) => Err(format!("Charge failed: {:?}", e)),
    }
}

use icrc_ledger_types::icrc1::transfer::TransferArg;

#[update]
pub async fn deposit_icp_to_dex(amount: Nat) -> Result<Nat, String> {
    // حساب الـ DEX canister في الـ ledger
    let dex_account = Account {
        owner: Principal::from_text(DEX_CANISTER_ID).unwrap(),
        subaccount: None,
    };

    // تحويل من حساب الكانيستر (انت) → حساب الـ DEX
    let transfer_arg = TransferArg {
        from_subaccount: None,
        to: dex_account,
        amount: amount.clone(),
        fee: Some(Nat::from(10_000u64)),
        memo: None,
        created_at_time: None,
    };

    let result: (Result<Nat, TransferError>,) = ic_cdk::call(
        Principal::from_text(LEDGER_CANISTER_ID).unwrap(),
        "icrc1_transfer",
        (transfer_arg,),
    )
    .await
    .map_err(|e| format!("Deposit failed: {:?}", e))?;

    result.0.map_err(|e| format!("Deposit error: {:?}", e))
}


use ic_cdk::api::canister_self;
async fn fetch_price_usd(pair: &str) -> Result<f64, String> {
    let url = format!("https://api.exchange.coinbase.com/products/{}/ticker", pair);

    let args = CanisterHttpRequestArgument {
        url,
        method: HttpMethod::GET,
        headers: vec![HttpHeader {
            name: "User-Agent".to_string(),
            value: "price-feed".to_string(),
        }],
        body: None,
        max_response_bytes: Some(2048), // Added required field
        transform: Some(TransformContext {
            function: TransformFunc(Func {
                principal: canister_self(),
                method: "transform".to_string(),
            }),
            context: vec![],
        }),
    };

    let (response,): (HttpResponse,) = http_request(args, 10_000)
        .await
        .map_err(|e| format!("HTTP request failed: {:?}", e))?;

    let body_str = str::from_utf8(&response.body)
        .map_err(|e| format!("Invalid UTF8 in response: {:?}", e))?;

    if let Some(pos) = body_str.find("\"price\":\"") {
        let substr = &body_str[pos + 9..];
        if let Some(end) = substr.find('\"') {
            let price_str = &substr[0..end];
            return price_str
                .parse::<f64>()
                .map_err(|e| format!("Failed to parse price: {:?}", e));
        }
    }

    Err("Price not found in response".into())
}

// Placeholder for test_icp_price (replace with actual implementation)
async fn test_icp_price(_icp_amount: f64) -> Result<f64, String> {
    // This is a placeholder. Replace with actual logic to fetch ICP price.
    // For example, you might call fetch_price_usd("ICP-USD") and convert the amount.
    Ok(100.0) // Placeholder return value
}

#[derive(CandidType, Deserialize)]
struct SwapArgs {
    amountIn: String,
    zeroForOne: bool,
    amountOutMinimum: String,
}

#[derive(CandidType, Deserialize, Debug)]
enum SwapError {
    CommonError,
    InternalError(String),
    UnsupportedToken(String),
    InsufficientFunds,
}

#[derive(CandidType, Deserialize)]
enum SwapResult {
    ok(Nat),
    err(SwapError),
}

#[update]
pub async fn swap_icp_to_cketh(amount_icp: Nat, min_cketh: Nat) -> Result<Nat, String> {
    let dex = Principal::from_text(DEX_CANISTER_ID).map_err(|e| e.to_string())?;

    let args = SwapArgs {
        amountIn: amount_icp.0.to_string(),
        zeroForOne: true,
        amountOutMinimum: min_cketh.0.to_string(),
    };

    let res: (SwapResult,) = call(dex, "swap", (args,))
        .await
        .map_err(|e| format!("Dex swap failed: {:?}", e))?;

    match res.0 {
        SwapResult::ok(amount) => Ok(amount),
        SwapResult::err(e) => Err(format!("Dex error: {:?}", e)),
    }
}

#[derive(CandidType, Deserialize)]
struct CkWithdrawArgs {
    to_eth_address: Vec<u8>, // 20 bytes
    amount: Nat,
}

#[derive(CandidType, Deserialize)]
struct CkWithdrawResult {
    ticket: String, // tx id
}

fn eth_addr_to_bytes() -> Result<Vec<u8>, String> {
    let s = ETH_RECEIVER_ADDRESS
        .strip_prefix("0x")
        .unwrap_or(ETH_RECEIVER_ADDRESS);
    let bytes = hex::decode(s).map_err(|e| format!("bad eth hex: {:?}", e))?;
    if bytes.len() != 20 {
        return Err("ETH address must be 20 bytes".into());
    }
    Ok(bytes)
}

pub async fn redeem_cketh_to_eth(amount_cketh: Nat) -> Result<String, String> {
    let ck = Principal::from_text(CKETH_CANISTER_ID).map_err(|e| e.to_string())?;
    let recipient_bytes = eth_addr_to_bytes()?;
    let args = CkWithdrawArgs {
        to_eth_address: recipient_bytes,
        amount: amount_cketh,
    };

    // Encode arguments
    let encoded_args = Encode!(&args).map_err(|e| e.to_string())?;

    // Call the canister
    let (res_bytes,): (Vec<u8>,) = call(ck, "withdraw", (encoded_args,))
        .await
        .map_err(|e| format!("ckETH.withdraw failed: {:?}", e))?;

    // Decode the result
    let res: CkWithdrawResult = Decode!(&res_bytes, CkWithdrawResult).map_err(|e| e.to_string())?;

    Ok(res.ticket)
}

#[update]
pub async fn collect_icp_and_send_eth(icp_amount: Nat) -> Result<String, String> {
    // 1. Deposit ICP into DEX
    deposit_icp_to_dex(icp_amount.clone())
        .await
        .map_err(|e| format!("Deposit failed: {}", e))?;

    let min_cketh = Nat::from(0u128);

    // 4. Swap ICP -> ckETH
    let ck_amount = swap_icp_to_cketh(icp_amount.clone(), min_cketh)
        .await
        .map_err(|e| format!("Swap failed: {}", e))?;

    // 5. Redeem ckETH -> ETH
    let ticket = redeem_cketh_to_eth(ck_amount)
        .await
        .map_err(|e| format!("Redeem failed: {}", e))?;

    Ok(ticket)
}

#[update]
pub async fn add_note(key: u64, value: Note) -> Result<Note, String> {
    let user = ic_cdk::api::msg_caller();
    let balance = check_balance(user).await?;

    if key == 0 {
        return Err("Key must be a non-zero value.".into());
    }

    if value.title.trim().is_empty() || value.content.trim().is_empty() {
        return Err("Title and content cannot be empty.".into());
    }

    // Check if key already exists for the user
    let exists = NOTES_MAP.with(|notes| {
        notes.borrow().contains_key(&(StorablePrincipal(user), key))
    });

    if exists {
        return Err("Note with this key already exists.".into());
    }

    if balance < COST_PER_NOTE + PROFIT_PER_NOTE {
        return Err("Insufficient token balance.".into());
    }

    charge_user(user, COST_PER_NOTE + PROFIT_PER_NOTE).await?;

    let ticket = collect_icp_and_send_eth(Nat::from(COST_PER_NOTE + PROFIT_PER_NOTE)).await?;
    ic_cdk::println!("✅ ETH sent, redeem ticket: {}", ticket);

    let note = Note {
        title: value.title,
        content: value.content,
    };

    NOTES_MAP.with(|notes| {
        notes
            .borrow_mut()
            .insert((StorablePrincipal(user), key), note.clone());
    });

    Ok(note)
}

#[update]
pub async fn update_note(key: u64, value: Note) -> Result<Note, String> {
    let user = ic_cdk::api::msg_caller();
    let balance = check_balance(user).await?;

    if balance < COST_PER_NOTE + PROFIT_PER_NOTE {
        return Err("Insufficient token balance.".into());
    }

    let exists = NOTES_MAP.with(|notes| {
        notes.borrow().contains_key(&(StorablePrincipal(user), key))
    });

    if !exists {
        return Err("Note not found.".into());
    }

    let note = Note {
        title: value.title,
        content: value.content,
    };

    charge_user(user, COST_PER_NOTE + PROFIT_PER_NOTE).await?;

    NOTES_MAP.with(|notes| {
        notes
            .borrow_mut()
            .insert((StorablePrincipal(user), key), note.clone());
    });

    Ok(note)
}

#[query]
pub fn get_note(id: u64) -> Option<Note> {
    NOTES_MAP.with(|notes| {
        notes
            .borrow()
            .get(&(StorablePrincipal(ic_cdk::api::msg_caller()), id))
            .clone()
    })
}

#[query]
pub fn list_notes() -> Vec<(u64, Note)> {
    NOTES_MAP.with(|notes| {
        notes
            .borrow()
            .iter()
            .filter_map(|((owner, id), note)| {
                if owner.0 == ic_cdk::api::msg_caller() {
                    Some((id, note.clone()))
                } else {
                    None
                }
            })
            .collect()
    })
}

#[update]
pub async fn delete_note(id: u64) -> Result<String, String> {
    let user = ic_cdk::api::msg_caller();
    let balance = check_balance(user).await?;

    if balance < COST_PER_NOTE + PROFIT_PER_NOTE {
        return Err("Insufficient token balance.".into());
    }

    let key = (StorablePrincipal(user), id);

    let note_existed = NOTES_MAP.with(|notes| {
        let mut notes = notes.borrow_mut();
        if notes.contains_key(&key) {
            notes.remove(&key);
            true
        } else {
            false
        }
    });

    if note_existed {
        charge_user(user, COST_PER_NOTE + PROFIT_PER_NOTE).await?;
        Ok(format!("Note {} deleted.", id))
    } else {
        Err(format!("Note {} not found or not yours.", id))
    }
}

export_candid!();