use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]

pub struct DeleteFilesEvent {
    files: Vec<String>,
}

#[tauri::command]
pub fn delete_files(event: DeleteFilesEvent) {
    trash::delete_all(&event.files).unwrap();
}
