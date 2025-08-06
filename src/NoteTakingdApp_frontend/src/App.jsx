import React, { useState, useEffect } from 'react';

// Helper to handle BigInt serialization for JSON.stringify
function jsonStringifyWithBigInt(obj) {
  return JSON.stringify(obj, (key, value) => (typeof value === "bigint" ? value.toString() : value));
}

function App() {
  const [notes, setNotes] = useState([]);
  const [newNote, setNewNote] = useState({ title: "", content: "" });
  const [editingNote, setEditingNote] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isConnected, setIsConnected] = useState(false);
  const [showAddNote, setShowAddNote] = useState(false);
  const [approvalAmount, setApprovalAmount] = useState(100000);
  const [showApprovalForm, setShowApprovalForm] = useState(false);
  const [getNoteIdInput, setGetNoteIdInput] = useState('');
  const [fetchedNote, setFetchedNote] = useState(null);
  const [showGetNoteSection, setShowGetNoteSection] = useState(false); // To toggle Get by ID section

  // Canister IDs based on your dfx deploy output:
  const BACKEND_CANISTER_ID = "uxrrr-q7777-77774-qaaaq-cai"; // This is NoteTakingdApp_backend
  const LEDGER_CANISTER_ID = "umunu-kh777-77774-qaaca-cai"; // This is icrc1_ledger_canister
  const HOST = "http://127.0.0.1:4943"; // Default local dfx host

  // Basic IC API call function (simplified, as discussed)
  const makeICCall = async (canisterId, method, args = [], isQuery = false) => {
    try {
      const callType = isQuery ? "query" : "call";
      const url = `${HOST}/api/v2/canister/${canisterId}/${callType}`;

      const requestBody = {
        request_type: callType,
        canister_id: canisterId,
        method_name: method,
        arg: args,
        sender: null, // Anonymous identity for simplicity
      };

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/cbor', // Still technically incorrect for JSON body
        },
        body: jsonStringifyWithBigInt(requestBody),
      });

      if (!response.ok) {
        throw new Error(`IC call failed: ${response.status} ${response.statusText}`);
      }
      const result = await response.json();

      if (result.status === 'replied') {
        return result.reply;
      } else if (result.status === 'rejected') {
        throw new Error(`Canister rejected: ${result.reject_message}`);
      } else {
        throw new Error(`Unexpected response status: ${result.status}`);
      }
    } catch (error) {
      console.error(`Error calling ${method}:`, error);
      setError(`Error calling ${method}: ${error.message}`);
      throw error;
    }
  };

  useEffect(() => {
    initConnection();
  }, []);

  const initConnection = async () => {
    setIsLoading(true);
    clearMessages();
    try {
      await fetchNotes();
      setIsConnected(true);
      setSuccess("Connected to Internet Computer successfully!");
      setTimeout(() => setSuccess(""), 3000);
    } catch (err) {
      console.error("Failed to connect:", err);
      setError("Failed to connect to IC canisters. Make sure dfx is running and canisters are deployed.");
      setIsConnected(false);
    }
    setIsLoading(false);
  };

  const fetchNotes = async () => {
    if (!isConnected && !isLoading) return;
    setIsLoading(true);
    clearMessages();
    try {
      const result = await makeICCall(BACKEND_CANISTER_ID, 'list_notes', [], true);
      if (Array.isArray(result)) {
        setNotes(result.map(([id, note]) => ({
          id: Number(id),
          title: note.title,
          content: note.content
        })));
      } else {
        setNotes([]);
      }
    } catch (error) {
      console.error("Error fetching notes:", error);
      setError("Failed to load notes: " + error.message);
      setIsConnected(false);
    }
    setIsLoading(false);
  };

  const getNote = async (noteId) => {
    if (!isConnected) {
      throw new Error("Not connected to IC");
    }
    try {
      const result = await makeICCall(BACKEND_CANISTER_ID, "get_note", [noteId], true);
      return result && Array.isArray(result) && result.length > 0 ? result[0] : null;
    } catch (error) {
      console.error("Error getting note:", error);
      throw error;
    }
  };

  const addNote = async () => {
    if (!isConnected) {
      setError("Not connected to IC. Please check your connection.");
      return;
    }
    if (!newNote.title.trim() || !newNote.content.trim()) {
      setError("Please enter both title and content.");
      return;
    }

    setIsLoading(true);
    clearMessages();
    try {
      const noteId = Date.now(); // Simple ID generation
      const noteData = { title: newNote.title.trim(), content: newNote.content.trim() };
      const result = await makeICCall(BACKEND_CANISTER_ID, "add_note", [noteId, noteData]);

      if (result && (result.Ok || result.success)) {
        const responseNote = result.Ok || noteData;
        setNotes((prev) => [
          ...prev,
          { id: noteId, title: responseNote.title, content: responseNote.content },
        ]);
        setNewNote({ title: "", content: "" });
        setShowAddNote(false);
        setSuccess("Note added successfully!");
        setTimeout(() => setSuccess(""), 3000);
      } else {
        throw new Error(result.Err ? Object.keys(result.Err)[0] : result.error || "Failed to add note");
      }
    } catch (error) {
      console.error("Error adding note:", error);
      setError("Failed to add note: " + error.message);
    }
    setIsLoading(false);
  };

  const updateNote = async () => {
    if (!isConnected) {
      setError("Not connected to IC. Please check your connection.");
      return;
    }
    if (!editingNote || !editingNote.title.trim() || !editingNote.content.trim()) {
      setError("Please enter both title and content.");
      return;
    }

    setIsLoading(true);
    clearMessages();
    try {
      const noteData = { title: editingNote.title.trim(), content: editingNote.content.trim() };
      const result = await makeICCall(BACKEND_CANISTER_ID, "update_note", [editingNote.id, noteData]);

      if (result && (result.Ok || result.success)) {
        const responseNote = result.Ok || noteData;
        setNotes((prev) =>
          prev.map((note) =>
            note.id === editingNote.id
              ? { id: editingNote.id, title: responseNote.title, content: responseNote.content }
              : note,
          ),
        );
        setEditingNote(null);
        setSuccess("Note updated successfully!");
        setTimeout(() => setSuccess(""), 3000);
      } else {
        throw new Error(result.Err ? Object.keys(result.Err)[0] : result.error || "Failed to update note");
      }
    } catch (error) {
      console.error("Error updating note:", error);
      setError("Failed to update note: " + error.message);
    }
    setIsLoading(false);
  };

  const deleteNote = async (noteId) => {
    if (!isConnected) {
      setError("Not connected to IC. Please check your connection.");
      return;
    }
    if (!window.confirm('Are you sure you want to delete this note?')) {
      return;
    }
    setIsLoading(true);
    clearMessages();
    try {
      const result = await makeICCall(BACKEND_CANISTER_ID, "delete_note", [noteId]);

      if (result && (result.Ok || result.success)) {
        setNotes((prev) => prev.filter((note) => note.id !== noteId));
        setSuccess("Note deleted successfully!");
        setTimeout(() => setSuccess(""), 3000);
      } else {
        throw new Error(result.Err ? Object.keys(result.Err)[0] : result.error || "Failed to delete note");
      }
    } catch (error) {
      console.error("Error deleting note:", error);
      setError("Failed to delete note: " + error.message);
    }
    setIsLoading(false);
  };

  const approveTokens = async () => {
    if (!isConnected) {
      setError("Not connected to IC. Please check your connection.");
      return;
    }
    setIsLoading(true);
    clearMessages();
    try {
      const approveArgs = {
        spender: { owner: BACKEND_CANISTER_ID, subaccount: [] },
        amount: BigInt(approvalAmount),
        expected_allowance: [], expires_at: [], fee: [], memo: [], created_at_time: [],
      };
      const result = await makeICCall(LEDGER_CANISTER_ID, "icrc2_approve", [approveArgs]);

      if (result && result.Ok !== undefined) {
        const blockIndex = result.Ok;
        setSuccess(`Tokens approved successfully! Block index: ${blockIndex}`);
        setShowApprovalForm(false);
        setTimeout(() => setSuccess(""), 5000);
      } else {
        const errorMsg = result.Err ? Object.keys(result.Err)[0] : "Unknown error";
        throw new Error(errorMsg);
      }
    } catch (error) {
      console.error("Error approving tokens:", error);
      setError("Failed to approve tokens: " + error.message);
    }
    setIsLoading(false);
  };

  const startEditing = (note) => {
    setEditingNote({ ...note });
    setShowAddNote(false);
    setShowApprovalForm(false);
    setShowGetNoteSection(false);
  };

  const cancelEditing = () => {
    setEditingNote(null);
  };

  const clearMessages = () => {
    setError("");
    setSuccess("");
  };

  const handleGetNoteById = async () => {
    const noteId = Number(getNoteIdInput);
    if (isNaN(noteId)) {
      setError("Invalid note ID. Please enter a number.");
      setFetchedNote(null);
      return;
    }
    if (!isConnected) {
      setError("Not connected to IC");
      return;
    }
    try {
      setIsLoading(true);
      clearMessages();
      const note = await getNote(noteId);
      if (note) {
        setFetchedNote({ id: noteId, title: note.title, content: note.content });
        setSuccess(`Note ID ${noteId} fetched successfully.`);
      } else {
        setError("Note not found!");
        setFetchedNote(null);
      }
    } catch (error) {
      setError("Error getting note: " + error.message);
      setFetchedNote(null);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: '800px', margin: '20px auto', padding: '20px', fontFamily: 'sans-serif', border: '1px solid #eee', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
      <h1 style={{ textAlign: 'center', color: '#333', marginBottom: '20px' }}>Internet Computer Notes DApp</h1>

      {/* Connection Status */}
      <div style={{ padding: '10px', marginBottom: '15px', borderRadius: '5px', border: `1px solid ${isConnected ? '#a8e6cf' : '#ffcccb'}`, backgroundColor: isConnected ? '#e6ffe6' : '#fff0f0', color: isConnected ? '#28a745' : '#dc3545' }}>
        <h3 style={{ margin: '0', fontSize: '1.1em' }}>Connection Status</h3>
        <p style={{ margin: '5px 0 0' }}>{isConnected ? "🟢 Connected to Internet Computer" : "🔴 Not Connected to IC - Check your dfx setup"}</p>
      </div>

      {/* Status Messages */}
      {error && (
        <div style={{ padding: '10px', marginBottom: '15px', borderRadius: '5px', border: '1px solid #dc3545', backgroundColor: '#fff0f0', color: '#dc3545' }}>
          <strong>Error:</strong> {error}
          <button onClick={clearMessages} style={{ float: 'right', background: 'none', border: 'none', cursor: 'pointer', color: '#dc3545' }}>X</button>
        </div>
      )}
      {success && (
        <div style={{ padding: '10px', marginBottom: '15px', borderRadius: '5px', border: '1px solid #28a745', backgroundColor: '#e6ffe6', color: '#28a745' }}>
          <strong>Success:</strong> {success}
          <button onClick={clearMessages} style={{ float: 'right', background: 'none', border: 'none', cursor: 'pointer', color: '#28a745' }}>X</button>
        </div>
      )}

      {/* Action Buttons */}
      {!showAddNote && !editingNote && !showApprovalForm && !showGetNoteSection && (
        <div style={{ marginBottom: '20px', display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
          <button
            onClick={() => setShowAddNote(true)}
            disabled={isLoading || !isConnected}
            style={{ padding: '10px 15px', backgroundColor: '#28a745', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer', opacity: (isLoading || !isConnected) ? 0.6 : 1 }}
          >
            Add New Note
          </button>
          <button
            onClick={() => setShowApprovalForm(true)}
            disabled={isLoading || !isConnected}
            style={{ padding: '10px 15px', backgroundColor: '#ffc107', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer', opacity: (isLoading || !isConnected) ? 0.6 : 1 }}
          >
            Approve Tokens
          </button>
          <button
            onClick={() => setShowGetNoteSection(true)}
            disabled={isLoading || !isConnected}
            style={{ padding: '10px 15px', backgroundColor: '#6f42c1', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer', opacity: (isLoading || !isConnected) ? 0.6 : 1 }}
          >
            Get Note by ID
          </button>
          <button
            onClick={initConnection}
            disabled={isLoading}
            style={{ padding: '10px 15px', backgroundColor: '#007bff', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer', opacity: isLoading ? 0.6 : 1 }}
          >
            {isLoading ? "Connecting..." : "Reconnect to IC"}
          </button>
        </div>
      )}

      {/* Approve Tokens Form */}
      {showApprovalForm && !editingNote && !showAddNote && !showGetNoteSection && (
        <div style={{ border: '1px solid #ffc107', padding: '15px', marginBottom: '20px', borderRadius: '8px', backgroundColor: '#fffbe6' }}>
          <h2 style={{ marginTop: '0', color: '#333' }}>Approve Tokens</h2>
          <p style={{ color: '#555' }}>Approve tokens to allow the backend canister to spend on your behalf for note operations.</p>
          <div style={{ marginBottom: '10px' }}>
            <label htmlFor="approval-amount" style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Amount to Approve:</label>
            <input
              id="approval-amount"
              type="number"
              value={approvalAmount}
              onChange={(e) => setApprovalAmount(Number(e.target.value))}
              placeholder="Enter amount (e.g., 100000)"
              disabled={isLoading}
              min="10000"
              step="10000"
              style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: '4px' }}
            />
            <small style={{ color: '#666', display: 'block', marginTop: '5px' }}>Recommended: 100,000 tokens (allows 10 operations at 10,000 tokens each)</small>
          </div>
          <div style={{ padding: '10px', border: '1px solid #ddd', backgroundColor: '#f8f9fa', borderRadius: '5px', marginBottom: '15px' }}>
            <h4 style={{ margin: '0', fontSize: '1em' }}>Approval Details:</h4>
            <p style={{ margin: '5px 0 0' }}>• Spender: {BACKEND_CANISTER_ID}</p>
            <p style={{ margin: '0' }}>• Ledger: {LEDGER_CANISTER_ID}</p>
            <p style={{ margin: '0' }}>• This allows the backend to charge you for note operations</p>
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              onClick={approveTokens}
              disabled={isLoading || !isConnected}
              style={{ padding: '10px 15px', backgroundColor: '#ffc107', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer', opacity: (isLoading || !isConnected) ? 0.6 : 1 }}
            >
              {isLoading ? "Approving..." : "Approve Tokens"}
            </button>
            <button
              onClick={() => setShowApprovalForm(false)}
              disabled={isLoading}
              style={{ padding: '10px 15px', backgroundColor: '#6c757d', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer', opacity: isLoading ? 0.6 : 1 }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Add New Note Form */}
      {showAddNote && !editingNote && !showApprovalForm && !showGetNoteSection && (
        <div style={{ border: '1px solid #007bff', padding: '15px', marginBottom: '20px', borderRadius: '8px', backgroundColor: '#e6f7ff' }}>
          <h2 style={{ marginTop: '0', color: '#333' }}>Add New Note</h2>
          <div style={{ marginBottom: '10px' }}>
            <label htmlFor="new-note-title" style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Title:</label>
            <input
              id="new-note-title"
              type="text"
              value={newNote.title}
              onChange={(e) => setNewNote({ ...newNote, title: e.target.value })}
              placeholder="Enter note title"
              disabled={isLoading}
              style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: '4px' }}
            />
          </div>
          <div style={{ marginBottom: '10px' }}>
            <label htmlFor="new-note-content" style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Content:</label>
            <textarea
              id="new-note-content"
              value={newNote.content}
              onChange={(e) => setNewNote({ ...newNote, content: e.target.value })}
              placeholder="Enter note content"
              disabled={isLoading}
              style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: '4px', minHeight: '100px', resize: 'vertical' }}
            ></textarea>
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              onClick={addNote}
              disabled={isLoading || !isConnected || !newNote.title.trim() || !newNote.content.trim()}
              style={{ padding: '10px 15px', backgroundColor: '#28a745', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer', opacity: (isLoading || !isConnected || !newNote.title.trim() || !newNote.content.trim()) ? 0.6 : 1 }}
            >
              {isLoading ? "Adding..." : "Add Note"}
            </button>
            <button
              onClick={() => { setShowAddNote(false); setNewNote({ title: "", content: "" }); }}
              disabled={isLoading}
              style={{ padding: '10px 15px', backgroundColor: '#6c757d', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer', opacity: isLoading ? 0.6 : 1 }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Get Note by ID Section */}
      {showGetNoteSection && !editingNote && !showAddNote && !showApprovalForm && (
        <div style={{ border: '1px solid #6f42c1', padding: '15px', marginBottom: '20px', borderRadius: '8px', backgroundColor: '#f3e6ff' }}>
          <h2 style={{ marginTop: '0', color: '#333' }}>Get Note by ID</h2>
          <div style={{ marginBottom: '10px' }}>
            <label htmlFor="get-note-id" style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Note ID:</label>
            <input
              id="get-note-id"
              type="number"
              value={getNoteIdInput}
              onChange={(e) => setGetNoteIdInput(e.target.value)}
              placeholder="Enter Note ID"
              disabled={isLoading || !isConnected}
              style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: '4px' }}
            />
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              onClick={handleGetNoteById}
              disabled={isLoading || !isConnected || !getNoteIdInput.trim()}
              style={{ padding: '10px 15px', backgroundColor: '#6f42c1', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer', opacity: (isLoading || !isConnected || !getNoteIdInput.trim()) ? 0.6 : 1 }}
            >
              {isLoading ? "Fetching..." : "Fetch Note"}
            </button>
            <button
              onClick={() => { setShowGetNoteSection(false); setFetchedNote(null); setGetNoteIdInput(''); clearMessages(); }}
              disabled={isLoading}
              style={{ padding: '10px 15px', backgroundColor: '#6c757d', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer', opacity: isLoading ? 0.6 : 1 }}
            >
              Close
            </button>
          </div>
          {fetchedNote && (
            <div style={{ marginTop: '15px', padding: '10px', border: '1px dashed #999', borderRadius: '5px', backgroundColor: '#f0f0f0' }}>
              <h4 style={{ margin: '0', fontSize: '1em' }}>Fetched Note: {fetchedNote.title} (ID: {fetchedNote.id})</h4>
              <p style={{ margin: '5px 0 0', fontSize: '0.9em', color: '#555' }}>{fetchedNote.content}</p>
            </div>
          )}
        </div>
      )}

      {/* Edit Note Form */}
      {editingNote && (
        <div style={{ border: '1px solid #ffc107', padding: '15px', marginBottom: '20px', borderRadius: '8px', backgroundColor: '#fffbe6' }}>
          <h2 style={{ marginTop: '0', color: '#333' }}>Edit Note (ID: {editingNote.id})</h2>
          <div style={{ marginBottom: '10px' }}>
            <label htmlFor="edit-note-title" style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Title:</label>
            <input
              id="edit-note-title"
              type="text"
              value={editingNote.title}
              onChange={(e) => setEditingNote({ ...editingNote, title: e.target.value })}
              disabled={isLoading}
              style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: '4px' }}
            />
          </div>
          <div style={{ marginBottom: '10px' }}>
            <label htmlFor="edit-note-content" style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Content:</label>
            <textarea
              id="edit-note-content"
              value={editingNote.content}
              onChange={(e) => setEditingNote({ ...editingNote, content: e.target.value })}
              disabled={isLoading}
              style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: '4px', minHeight: '100px', resize: 'vertical' }}
            ></textarea>
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              onClick={updateNote}
              disabled={isLoading || !isConnected || !editingNote.title.trim() || !editingNote.content.trim()}
              style={{ padding: '10px 15px', backgroundColor: '#ffc107', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer', opacity: (isLoading || !isConnected || !editingNote.title.trim() || !editingNote.content.trim()) ? 0.6 : 1 }}
            >
              {isLoading ? "Updating..." : "Update Note"}
            </button>
            <button
              onClick={cancelEditing}
              disabled={isLoading}
              style={{ padding: '10px 15px', backgroundColor: '#6c757d', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer', opacity: isLoading ? 0.6 : 1 }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Notes List */}
      <div style={{ marginBottom: '20px' }}>
        <h2 style={{ display: 'inline-block', marginRight: '10px', color: '#333' }}>My Notes ({notes.length})</h2>
        <button
          onClick={fetchNotes}
          disabled={isLoading || !isConnected}
          style={{ padding: '8px 12px', backgroundColor: '#007bff', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer', opacity: (isLoading || !isConnected) ? 0.6 : 1 }}
        >
          {isLoading ? "Loading..." : "Refresh"}
        </button>
        <br />
        {!isConnected ? (
          <div style={{ padding: '15px', textAlign: 'center', border: '1px solid #dc3545', backgroundColor: '#fff0f0', color: '#dc3545', borderRadius: '8px' }}>
            <h3>Connection Required</h3>
            <p>Not connected to Internet Computer. Please check your dfx setup and try reconnecting.</p>
          </div>
        ) : notes.length === 0 ? (
          <div style={{ padding: '15px', textAlign: 'center', border: '1px solid #ddd', backgroundColor: '#f8f9fa', color: '#666', borderRadius: '8px' }}>
            <h3>No Notes</h3>
            <p>{isLoading ? "Loading notes..." : "No notes yet. Add your first note!"}</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: '15px', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', marginTop: '15px' }}>
            {notes.map((note) => (
              <div key={note.id} style={{ border: '1px solid #ccc', borderRadius: '8px', padding: '15px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)', backgroundColor: 'white', opacity: isLoading ? 0.7 : 1 }}>
                <h3 style={{ marginTop: '0', marginBottom: '10px', fontSize: '1.2em', color: '#333', wordBreak: 'break-word' }}>{note.title}</h3>
                <p style={{ fontSize: '0.9em', color: '#555', lineHeight: '1.5', wordBreak: 'break-word' }}>{note.content}</p>
                <small style={{ color: '#777', display: 'block', marginTop: '10px' }}>ID: {note.id}</small>
                <div style={{ display: 'flex', gap: '10px', marginTop: '15px' }}>
                  <button
                    onClick={() => startEditing(note)}
                    disabled={isLoading || !isConnected}
                    style={{ padding: '8px 12px', backgroundColor: '#ffc107', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer', opacity: (isLoading || !isConnected) ? 0.6 : 1 }}
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => deleteNote(note.id)}
                    disabled={isLoading || !isConnected}
                    style={{ padding: '8px 12px', backgroundColor: '#dc3545', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer', opacity: (isLoading || !isConnected) ? 0.6 : 1 }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Setup Instructions */}
      <div style={{ marginTop: '30px', padding: '20px', border: `1px solid ${isConnected ? '#a8e6cf' : '#ffcccb'}`, backgroundColor: isConnected ? '#e6ffe6' : '#fff0f0', borderRadius: '8px', fontSize: '0.9em' }}>
        <h3 style={{ marginTop: '0', color: isConnected ? '#28a745' : '#dc3545' }}>
          {isConnected ? "✅ Connected to Internet Computer" : "❌ Connection Required"}
        </h3>
        <div style={{ padding: '10px', border: '1px solid #ddd', backgroundColor: '#f8f9fa', borderRadius: '5px', marginBottom: '15px', color: '#555' }}>
          <h4 style={{ margin: '0', fontSize: '1em' }}>Current Configuration:</h4>
          <p style={{ margin: '5px 0 0' }}>• Backend Canister: {BACKEND_CANISTER_ID}</p>
          <p style={{ margin: '0' }}>• Ledger Canister: {LEDGER_CANISTER_ID}</p>
          <p style={{ margin: '0' }}>• Host: {HOST}</p>
          <p style={{ margin: '0' }}>• Status: {isConnected ? "🟢 Connected" : "🔴 Disconnected"}</p>
        </div>

        {!isConnected && (
          <div style={{ padding: '10px', border: '1px solid #ffc107', backgroundColor: '#fffbe6', color: '#856404', borderRadius: '5px' }}>
            <h4 style={{ margin: '0', fontSize: '1em' }}>To connect to Internet Computer:</h4>
            <p style={{ margin: '5px 0 0' }}>1. Start your local IC replica: <code style={{ backgroundColor: '#eee', padding: '2px 4px', borderRadius: '3px' }}>dfx start</code></p>
            <p style={{ margin: '0' }}>2. Deploy your canisters: <code style={{ backgroundColor: '#eee', padding: '2px 4px', borderRadius: '3px' }}>dfx deploy</code></p>
            <p style={{ margin: '0' }}>3. Make sure canister IDs match your deployment</p>
            <p style={{ margin: '0' }}>4. Open your browser to the frontend URL provided by dfx</p>
          </div>
        )}

        <p style={{ marginTop: '15px', fontWeight: 'bold', color: isConnected ? '#28a745' : '#dc3545' }}>
          Features: Real IC Integration Only • Token Approvals • CRUD Operations • Error Handling
        </p>
      </div>
    </div>
  );
}

export default App;
