use std::collections::HashMap;
use std::time::{Duration, Instant};

pub struct SessionStore {
    data: HashMap<String, SessionEntry>,
    capacity: usize,
    timeout: Duration,
}

struct SessionEntry {
    payload: String,
    valid_until: Instant,
    hit_count: u64,
}

impl SessionStore {
    pub fn new(capacity: usize, timeout: Duration) -> Self {
        Self {
            data: HashMap::new(),
            capacity,
            timeout,
        }
    }

    pub fn get(&mut self, session_id: &str) -> Option<&str> {
        let record = self.data.get_mut(session_id)?;
        if record.valid_until < Instant::now() {
            self.data.remove(session_id);
            return None;
        }
        record.hit_count += 1;
        Some(&record.payload)
    }

    pub fn set(&mut self, session_id: String, payload: String) {
        if self.data.len() >= self.capacity {
            self.evict_least_used();
        }
        let record = SessionEntry {
            payload,
            valid_until: Instant::now() + self.timeout,
            hit_count: 0,
        };
        self.data.insert(session_id, record);
    }

    fn evict_least_used(&mut self) {
        if let Some(lru_key) = self
            .data
            .iter()
            .min_by_key(|(_, e)| e.hit_count)
            .map(|(k, _)| k.clone())
        {
            self.data.remove(&lru_key);
        }
    }
}
