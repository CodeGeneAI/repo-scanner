use std::collections::HashMap;
use std::time::{Duration, Instant};

pub struct MemoryCache {
    store: HashMap<String, CacheEntry>,
    max_size: usize,
    default_ttl: Duration,
}

struct CacheEntry {
    value: String,
    expires_at: Instant,
    access_count: u64,
}

impl MemoryCache {
    pub fn new(max_size: usize, default_ttl: Duration) -> Self {
        Self {
            store: HashMap::new(),
            max_size,
            default_ttl,
        }
    }

    pub fn get(&mut self, key: &str) -> Option<&str> {
        let entry = self.store.get_mut(key)?;
        if entry.expires_at < Instant::now() {
            self.store.remove(key);
            return None;
        }
        entry.access_count += 1;
        Some(&entry.value)
    }

    pub fn set(&mut self, key: String, value: String) {
        if self.store.len() >= self.max_size {
            self.evict_oldest();
        }
        let entry = CacheEntry {
            value,
            expires_at: Instant::now() + self.default_ttl,
            access_count: 0,
        };
        self.store.insert(key, entry);
    }

    fn evict_oldest(&mut self) {
        if let Some(oldest_key) = self
            .store
            .iter()
            .min_by_key(|(_, e)| e.access_count)
            .map(|(k, _)| k.clone())
        {
            self.store.remove(&oldest_key);
        }
    }
}
