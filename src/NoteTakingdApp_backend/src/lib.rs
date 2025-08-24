use candid::{CandidType, Decode, Deserialize, Encode, Principal};
use ic_cdk::{call, export_candid, query, update};
use num_traits::ToPrimitive;
use ic_stable_structures::{
    memory_manager::{MemoryId, MemoryManager, VirtualMemory},
    storable::{BoundedStorable, Storable},
    StableBTreeMap, DefaultMemoryImpl,
};
use std::{borrow::Cow, cell::RefCell};
use ic_cdk::api::msg_caller;
use icrc_ledger_types::icrc1::account::Account;
use icrc_ledger_types::icrc1::transfer::{BlockIndex, NumTokens};
use icrc_ledger_types::icrc2::transfer_from::{TransferFromArgs, TransferFromError};
use serde::Serialize;

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

    let result: (Result<Nat, TransferFromError>,) = call(
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

use std::str;
use ic_cdk::management_canister::{http_request, HttpRequestArgs, HttpMethod, HttpHeader};

async fn fetch_price_usd(pair: &str) -> Result<f64, String> {
    let url = format!("https://api.exchange.coinbase.com/products/{}/ticker", pair);

    let request = HttpRequestArgs {
        url,
        method: HttpMethod::GET,
        headers: vec![HttpHeader {
            name: "User-Agent".to_string(),
            value: "price-feed".to_string(),
        }],
        body: None,
        max_response_bytes: Some(2000),
        transform: None,
    };

    // send request
    let response = http_request(&request)
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

#[update]
pub async fn test_icp_price(icp_amount: f64) -> Result<f64, String> {
    let icp_usd  = fetch_price_usd("ICP-USD").await?;
    let eth_usd = fetch_price_usd("ETH-USD").await?;

    if eth_usd == 0.0 {
        return Err("ETH price is zero, cannot compute ICP/ETH".into());
    }
    
    let price_ratio = eth_usd / icp_usd;
    let eth_amount = price_ratio * icp_amount;
    Ok(eth_amount)
}

use ic_cdk::{api};
use ic_cdk::api::call::call_with_payment128;

/// 1) Swap ICP -> ckETH
#[derive(CandidType, Deserialize)]
struct SwapArgs {
    from_token: String, // e.g. "ICP" or canister id
    to_token: String,   // e.g. canister id for ckETH
    amount_in: Nat,     // amount of ICP (in e8s or appropriate unit)
    min_amount_out: Nat, // slippage protection
    recipient: Principal, // who receives ckETH 
}

#[derive(CandidType, Deserialize)]
struct SwapResult {
    amount_out: Nat,
}

pub async fn swap_icp_to_cketh(amount_icp: Nat, min_cketh: Nat) -> Result<Nat, String> {
    let dex = Principal::from_text(DEX_CANISTER_ID).map_err(|e| e.to_string())?;
    let args = SwapArgs {
        from_token: "ICP".to_string(),
        to_token: "ckETH".to_string(),
        amount_in: amount_icp,
        min_amount_out: min_cketh,
        recipient: api::id(), // BACKEND_CANISTER
    };
 
    let cycles: u128 = 2_000_000_000u128;
    let (res,): (SwapResult,) = call_with_payment128(dex, "swap", (args,), cycles)
        .await
        .map_err(|e| format!("Dex swap failed: {:?}", e))?;

    Ok(res.amount_out)
}

/// 2) Redeem ckETH -> send ETH to MetaMask
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
    let s = ETH_RECEIVER_ADDRESS.strip_prefix("0x").unwrap_or(ETH_RECEIVER_ADDRESS);
    let bytes = hex::decode(s).map_err(|e| format!("bad eth hex: {:?}", e))?;
    if bytes.len() != 20 {
        return Err("ETH address must be 20 bytes".into());
    }
    Ok(bytes)
}

pub async fn redeem_cketh_to_eth(amount_cketh: Nat) -> Result<String, String> {
    let ck = Principal::from_text(CKETH_CANISTER_ID).map_err(|e| e.to_string())?;
    let recipient_bytes = eth_addr_to_bytes()?;
    let args = CkWithdrawArgs { to_eth_address: recipient_bytes, amount: amount_cketh };

    let cycles: u128 = 20_000_000_000u128;

    let (res,): (CkWithdrawResult,) = call_with_payment128(ck, "withdraw", (args,), cycles)
        .await
        .map_err(|e| format!("ckETH.withdraw failed: {:?}", e))?;

    Ok(res.ticket)
}

#[update]
pub async fn collect_icp_and_send_eth(icp_amount: Nat) -> Result<String, String> {
    // 0) make sure the user approves the backend canister can charge from his token balance (transfer_from)

    // convert ICP amount -> f64
    let icp_f64 = icp_amount.0.to_f64().ok_or("Failed to convert ICP amount to f64")?;

    // fetch ckETH amount expected
    let expected_cketh = test_icp_price(icp_f64).await?;

    // apply 1% slippage
    let min_cketh_f64 = expected_cketh * 0.99;
    let min_cketh = Nat::from(min_cketh_f64 as u128);

    // 2) swap ICP -> ckETH ( recipient = this canister)
    let ck_amount = swap_icp_to_cketh(icp_amount, min_cketh).await?;

    // 3) redeem ckETH -> ETH (send to metamask_addr)
    let ticket = redeem_cketh_to_eth(ck_amount).await?;

    Ok(ticket)
}

// ---- Canister Functions ----

#[update]
pub async fn add_note(key: u64, value: Note) -> Result<Note, String> {
    let user = ic_cdk::caller();
    let balance = check_balance(user).await?;

    if key == 0 {
        return Err("Key must be a non-zero value.".into());
    }

    if value.title.trim().is_empty() || value.content.trim().is_empty() {
        return Err("Title and content cannot be empty.".into());
    }

    // check if key already exists for the user
    let exists = NOTES_MAP.with(|notes| {
        notes.borrow().contains_key(&(StorablePrincipal(user), key))
    });

    if exists {
        return Err("Note with this key already exists.".into());
    }

    if balance < COST_PER_NOTE + PROFIT_PER_NOTE{
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
        notes.borrow_mut().insert((StorablePrincipal(user), key), note.clone());
    });

    
    Ok(note)
}

#[update]
pub async fn update_note(key: u64, value: Note) -> Result<Note, String> {
    let user = ic_cdk::caller();
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
        notes.borrow_mut().insert((StorablePrincipal(user), key), note.clone());
    });

    Ok(note)
}

#[query]
pub fn get_note(id: u64) -> Option<Note> {
    NOTES_MAP.with(|notes| {
        notes.borrow().get(&(StorablePrincipal(ic_cdk::caller()), id)).clone()
    })
}

#[query]
pub fn list_notes() -> Vec<(u64, Note)> {
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
pub async fn delete_note(id: u64) -> Result<String, String> {
    let user = ic_cdk::caller();
    let balance = check_balance(user).await?;

    if balance < COST_PER_NOTE + PROFIT_PER_NOTE{
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