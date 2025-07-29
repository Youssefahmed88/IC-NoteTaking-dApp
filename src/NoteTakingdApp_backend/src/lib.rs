use candid::{CandidType, Decode, Deserialize, Encode, Principal};
use ic_cdk::{export_candid, query, update};
use ic_stable_structures::{
    memory_manager::{MemoryId, MemoryManager, VirtualMemory},
    storable::{BoundedStorable, Storable},
    StableBTreeMap, DefaultMemoryImpl,
};
use std::{borrow::Cow, cell::RefCell};
use ic_cdk::api::caller;

// Custom Principal wrapper to implement BoundedStorable and Default
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
    const MAX_SIZE: u32 = 29; // Max size of a Principal
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

#[update]
fn add_note(key: u64, value: Note) -> Option<Note> {
    let note = Note {
        title: value.title,
        content: value.content,
    };
    NOTES_MAP.with(|notes| {
        notes.borrow_mut().insert((StorablePrincipal(caller()), key), note.clone());
        Some(note)
    })
}

#[update]
fn update_note(key: u64, value: Note) -> Option<Note> {
    let note = Note {
        title: value.title,
        content: value.content,
    };

    NOTES_MAP.with(|notes| {
        notes.borrow_mut().insert((StorablePrincipal(caller()), key), note.clone());
        Some(note)
    })
}

#[query]
fn get_note(id: u64) -> Option<Note> {
    NOTES_MAP.with(|notes| {
        notes.borrow().get(&(StorablePrincipal(caller()), id)).clone()
    })
}

#[query]
fn list_notes() -> Vec<(u64, Note)> {
    NOTES_MAP.with(|notes| {
        notes
            .borrow()
            .iter()
            .filter_map(|((owner, id), note)| {
                if owner.0 == caller() {
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
    let key = (StorablePrincipal(caller()), id);

    NOTES_MAP.with(|notes| {
        let mut notes = notes.borrow_mut();
        if notes.contains_key(&key) {
            notes.remove(&key);
            Ok(format!("Note {} deleted successfully.", id))
        } else {
            Err(format!("Note {} not found or you are not the owner.", id))
        }
    })
}

export_candid!();