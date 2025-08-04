import React, { useState, useEffect } from 'react';
import { AuthClient } from '@dfinity/auth-client';
import { Actor, HttpAgent } from '@dfinity/agent';
import { Principal } from '@dfinity/principal';
import { Plus, Edit, Trash2, LogOut, User, Save, X } from 'lucide-react';

// Define the canister interface
const idlFactory = ({ IDL }) => {
  const Note = IDL.Record({ 'title': IDL.Text, 'content': IDL.Text });
  return IDL.Service({
    'add_note': IDL.Func([IDL.Nat64, Note], [IDL.Opt(Note)], []),
    'update_note': IDL.Func([IDL.Nat64, Note], [IDL.Opt(Note)], []),
    'get_note': IDL.Func([IDL.Nat64], [IDL.Opt(Note)], ['query']),
    'list_notes': IDL.Func([], [IDL.Vec(IDL.Tuple(IDL.Nat64, Note))], ['query']),
    'delete_note': IDL.Func([IDL.Nat64], [IDL.Variant({ 'Ok': IDL.Text, 'Err': IDL.Text })], []),
  });
};

// Replace with your actual canister ID - get it from dfx canister id <canister_name>
const CANISTER_ID = process.env.REACT_APP_CANISTER_ID || 'bkyz2-fmaaa-aaaaa-qaaaq-cai';

const NotesApp = () => {
  const [authClient, setAuthClient] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [principal, setPrincipal] = useState(null);
  const [actor, setActor] = useState(null);
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingNote, setEditingNote] = useState(null);
  const [formData, setFormData] = useState({ title: '', content: '' });

  // Initialize auth client
  useEffect(() => {
    const initAuth = async () => {
      try {
        const client = await AuthClient.create({
          idleOptions: {
            idleTimeout: 1000 * 60 * 30, // 30 minutes
            disableDefaultIdleCallback: true
          }
        });
        setAuthClient(client);
        
        const isAuth = await client.isAuthenticated();
        console.log('Is authenticated:', isAuth);
        
        if (isAuth) {
          const identity = client.getIdentity();
          const principal = identity.getPrincipal();
          console.log('Existing principal:', principal.toString());
          setPrincipal(principal);
          await initActor(identity);
        }
      } catch (error) {
        console.error('Failed to initialize auth:', error);
      } finally {
        setLoading(false);
      }
    };

    initAuth();
  }, []);

  // Initialize actor with authenticated identity
  const initActor = async (identity) => {
    try {
      // Always use localhost for development
      const host = 'http://localhost:4943';
      
      const agent = new HttpAgent({ 
        identity,
        host
      });
      
      // Always fetch root key for local development
      await agent.fetchRootKey();

      const notesActor = Actor.createActor(idlFactory, {
        agent,
        canisterId: CANISTER_ID,
      });

      setActor(notesActor);
      await loadNotes(notesActor);
    } catch (error) {
      console.error('Failed to initialize actor:', error);
    }
  };

  // Load notes from canister
  const loadNotes = async (actorInstance = actor) => {
    if (!actorInstance) return;
    
    try {
      const notesList = await actorInstance.list_notes();
      setNotes(notesList.map(([id, note]) => ({ id: Number(id), ...note })));
    } catch (error) {
      console.error('Failed to load notes:', error);
    }
  };

  // Login with Internet Identity
  const login = async () => {
    if (!authClient) return;

    try {
      await authClient.login({
        identityProvider: `http://localhost:4943/?canisterId=be2us-64aaa-aaaaa-qaabq-cai#authorize`,
        maxTimeToLive: BigInt(7 * 24 * 60 * 60 * 1000 * 1000 * 1000), // 7 days in nanoseconds
        windowOpenerFeatures: "toolbar=0,location=0,menubar=0,width=500,height=500,left=100,top=100",
        onSuccess: async () => {
          setIsAuthenticated(true);
          const identity = authClient.getIdentity();
          const principal = identity.getPrincipal();
          setPrincipal(principal);
          await initActor(identity);
        },
        onError: (error) => {
          console.error('Login error:', error);
        }
      });
    } catch (error) {
      console.error('Login failed:', error);
    }
  };

  // Logout
  const logout = async () => {
    if (!authClient) return;

    try {
      await authClient.logout();
      setIsAuthenticated(false);
      setPrincipal(null);
      setActor(null);
      setNotes([]);
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  // Add new note
  const addNote = async () => {
    if (!actor || !formData.title.trim()) return;

    try {
      const id = Date.now();
      const note = { title: formData.title, content: formData.content };
      await actor.add_note(BigInt(id), note);
      await loadNotes();
      setFormData({ title: '', content: '' });
      setShowAddForm(false);
    } catch (error) {
      console.error('Failed to add note:', error);
    }
  };

  // Update existing note
  const updateNote = async () => {
    if (!actor || !editingNote || !formData.title.trim()) return;

    try {
      const note = { title: formData.title, content: formData.content };
      await actor.update_note(BigInt(editingNote.id), note);
      await loadNotes();
      setFormData({ title: '', content: '' });
      setEditingNote(null);
    } catch (error) {
      console.error('Failed to update note:', error);
    }
  };

  // Delete note
  const deleteNote = async (id) => {
    if (!actor) return;

    try {
      const result = await actor.delete_note(BigInt(id));
      if ('Ok' in result) {
        await loadNotes();
      } else {
        console.error('Delete failed:', result.Err);
      }
    } catch (error) {
      console.error('Failed to delete note:', error);
    }
  };

  // Start editing a note
  const startEditing = (note) => {
    setEditingNote(note);
    setFormData({ title: note.title, content: note.content });
    setShowAddForm(false);
  };

  // Cancel editing/adding
  const cancelForm = () => {
    setFormData({ title: '', content: '' });
    setShowAddForm(false);
    setEditingNote(null);
  };

  if (loading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner"></div>
        <p>Loading...</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="login-container">
        <div className="login-card">
          <h1>IC Notes App</h1>
          <p>Secure note-taking powered by Internet Computer</p>
          <button onClick={login} className="login-btn">
            <User size={20} />
            Login with Internet Identity
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="header-content">
          <h1>My Notes</h1>
          <div className="header-actions">
            <span className="principal-text">
              {principal?.toString().slice(0, 8)}...
            </span>
            <button onClick={logout} className="logout-btn">
              <LogOut size={18} />
              Logout
            </button>
          </div>
        </div>
      </header>

      <main className="main-content">
        <div className="add-note-section">
          {!showAddForm && !editingNote && (
            <button 
              onClick={() => setShowAddForm(true)} 
              className="add-note-btn"
            >
              <Plus size={20} />
              Add New Note
            </button>
          )}
        </div>

        {(showAddForm || editingNote) && (
          <div className="note-form">
            <h3>{editingNote ? 'Edit Note' : 'Add New Note'}</h3>
            <input
              type="text"
              placeholder="Note title..."
              value={formData.title}
              onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
              className="form-input"
            />
            <textarea
              placeholder="Write your note content here..."
              value={formData.content}
              onChange={(e) => setFormData(prev => ({ ...prev, content: e.target.value }))}
              className="form-textarea"
              rows={6}
            />
            <div className="form-actions">
              <button 
                onClick={editingNote ? updateNote : addNote}
                className="save-btn"
                disabled={!formData.title.trim()}
              >
                <Save size={18} />
                {editingNote ? 'Update Note' : 'Save Note'}
              </button>
              <button onClick={cancelForm} className="cancel-btn">
                <X size={18} />
                Cancel
              </button>
            </div>
          </div>
        )}

        <div className="notes-grid">
          {notes.length === 0 ? (
            <div className="empty-state">
              <p>No notes yet. Create your first note!</p>
            </div>
          ) : (
            notes.map((note) => (
              <div key={note.id} className="note-card">
                <div className="note-header">
                  <h3 className="note-title">{note.title}</h3>
                  <div className="note-actions">
                    <button 
                      onClick={() => startEditing(note)}
                      className="edit-btn"
                      title="Edit note"
                    >
                      <Edit size={16} />
                    </button>
                    <button 
                      onClick={() => deleteNote(note.id)}
                      className="delete-btn"
                      title="Delete note"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
                <div className="note-content">
                  {note.content || 'No content'}
                </div>
              </div>
            ))
          )}
        </div>
      </main>
    </div>
  );
};

export default NotesApp;