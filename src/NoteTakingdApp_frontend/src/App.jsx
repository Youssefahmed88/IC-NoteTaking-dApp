"use client"

import { useState, useEffect } from "react"
import { AuthClient } from "@dfinity/auth-client"
import {
  Plus,
  Trash2,
  LogOut,
  Save,
  X,
  Search,
  Eye,
  Download,
  RefreshCw,
  SortAsc,
  SortDesc,
  User,
  Hash,
  Database,
} from "lucide-react"
import { createActor, idlFactory } from "./actor" // Import createActor and idlFactory

const BACKEND_CANISTER_ID = "uxrrr-q7777-77774-qaaaq-cai"
const network = process.env.DFX_NETWORK || "local" // Default to "local" if not set

// Hardcode the Internet Identity canister ID for local development
const INTERNET_IDENTITY_CANISTER_ID = "rdmx6-jaaaa-aaaaa-aaadq-cai"

const identityProvider =
  network === "ic" ? "https://identity.ic0.app" : `http://127.0.0.1:4943/?canisterId=${INTERNET_IDENTITY_CANISTER_ID}`

// Simple, clean styles (kept as per original request)
const styles = {
  container: {
    minHeight: "100vh",
    background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
    fontFamily: "system-ui, -apple-system, sans-serif",
  },
  loginCard: {
    background: "rgba(255, 255, 255, 0.95)",
    padding: "2rem",
    borderRadius: "1rem",
    boxShadow: "0 20px 40px rgba(0, 0, 0, 0.1)",
    maxWidth: "400px",
    width: "100%",
    textAlign: "center",
  },
  header: {
    background: "rgba(255, 255, 255, 0.95)",
    padding: "1rem 2rem",
    borderBottom: "1px solid rgba(255, 255, 255, 0.2)",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    gap: "1rem",
  },
  button: {
    background: "linear-gradient(135deg, #667eea, #764ba2)",
    color: "white",
    border: "none",
    padding: "0.75rem 1.5rem",
    borderRadius: "0.5rem",
    fontWeight: "600",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
    transition: "all 0.2s",
  },
  smallButton: {
    background: "linear-gradient(135deg, #667eea, #764ba2)",
    color: "white",
    border: "none",
    padding: "0.5rem 1rem",
    borderRadius: "0.375rem",
    fontSize: "0.875rem",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    gap: "0.375rem",
    transition: "all 0.2s",
  },
  input: {
    width: "100%",
    padding: "0.75rem",
    border: "2px solid rgba(102, 126, 234, 0.2)",
    borderRadius: "0.5rem",
    fontSize: "1rem",
    outline: "none",
    background: "rgba(255, 255, 255, 0.9)",
  },
  textarea: {
    width: "100%",
    padding: "0.75rem",
    border: "2px solid rgba(102, 126, 234, 0.2)",
    borderRadius: "0.5rem",
    fontSize: "1rem",
    outline: "none",
    resize: "vertical",
    minHeight: "100px",
    fontFamily: "inherit",
    background: "rgba(255, 255, 255, 0.9)",
  },
  card: {
    background: "rgba(255, 255, 255, 0.95)",
    borderRadius: "1rem",
    padding: "1.5rem",
    boxShadow: "0 10px 20px rgba(0, 0, 0, 0.1)",
    transition: "transform 0.2s",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
    gap: "1.5rem",
    marginTop: "2rem",
  },
  modal: {
    position: "fixed",
    top: "0",
    left: "0",
    right: "0",
    bottom: "0",
    background: "rgba(0, 0, 0, 0.5)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: "1000",
    padding: "1rem",
  },
  modalContent: {
    background: "white",
    borderRadius: "1rem",
    padding: "2rem",
    maxWidth: "600px",
    width: "100%",
    maxHeight: "80vh",
    overflow: "auto",
  },
}

export default function Component() {
  const [authClient, setAuthClient] = useState(null)
  const [actor, setActor] = useState(null)
  const [principal, setPrincipal] = useState("")
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [notes, setNotes] = useState([])
  const [newNote, setNewNote] = useState({ title: "", content: "" })
  const [searchQuery, setSearchQuery] = useState("")
  const [editingNoteId, setEditingNoteId] = useState(null)
  const [editingTitle, setEditingTitle] = useState("")
  const [editingContent, setEditingContent] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [sortBy, setSortBy] = useState("id")
  const [sortOrder, setSortOrder] = useState("asc")
  const [viewingNote, setViewingNote] = useState(null)

  useEffect(() => {
    initAuth()
  }, [])

  const clearMessages = () => {
    setError(null)
    setSuccess(null)
  }

  const initAuth = async () => {
    setLoading(true)
    clearMessages()
    try {
      const client = await AuthClient.create()
      const identity = client.getIdentity()
      const isAuth = await client.isAuthenticated()
      const backendActor = createActor(BACKEND_CANISTER_ID, idlFactory, {
        agentOptions: {
          identity,
          host: network === "ic" ? "https://ic0.app" : "http://127.0.0.1:4943", // Explicitly use 127.0.0.1
        },
      })
      setAuthClient(client)
      setActor(backendActor)
      setIsAuthenticated(isAuth)
      if (isAuth) {
        setPrincipal(identity.getPrincipal().toText())
        await fetchNotes(backendActor)
      }
    } catch (e) {
      console.error("Error during auth initialization:", e)
      setError("Failed to initialize authentication. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  const login = async () => {
    setLoading(true)
    clearMessages()
    try {
      await authClient.login({
        identityProvider: `${identityProvider}`,
        onSuccess: initAuth,
        maxTimeToLive: BigInt(7 * 24 * 60 * 60 * 1_000_000_000), // 7 days
      })
    } catch (e) {
      console.error("Error during login:", e)
      setError("Login failed. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  const logout = async () => {
    setLoading(true)
    clearMessages()
    try {
      await authClient.logout()
      await initAuth()
      setSuccess("Logged out successfully.")
    } catch (e) {
      console.error("Error during logout:", e)
      setError("Logout failed. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  const fetchNotes = async (backendActor) => {
    if (!backendActor) return
    setLoading(true)
    clearMessages()
    try {
      const result = await backendActor.list_notes()
      // Map the result from Vec<(u64, Note)> to { id: bigint, title: string, content: string }
      const formattedNotes = result.map(([id, note]) => ({
        id: BigInt(id), // Convert u64 to BigInt
        title: note.title,
        content: note.content,
      }))
      setNotes(formattedNotes)
      setSuccess("Notes loaded successfully.")
    } catch (e) {
      console.error("Error fetching notes:", e)
      setError("Failed to fetch notes. Please refresh.")
    } finally {
      setLoading(false)
    }
  }

  const addNote = async () => {
    if (!actor || !newNote.title.trim() || !newNote.content.trim()) return
    setLoading(true)
    clearMessages()
    try {
      // The backend's add_note now generates its own ID, so we just pass the Note object
      const result = await actor.add_note({
        title: newNote.title.trim(),
        content: newNote.content.trim(),
      })
      if (result.length > 0) {
        setSuccess("Note added successfully!")
      } else {
        setError("Failed to add note.")
      }
      setNewNote({ title: "", content: "" })
      setShowAddForm(false)
      await fetchNotes(actor)
    } catch (error) {
      console.error("Error adding note:", error)
      setError("Error adding note. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  const deleteNote = async (id) => {
    if (!actor) return
    setLoading(true)
    clearMessages()
    try {
      const result = await actor.delete_note(id)
      if ("Ok" in result) {
        setSuccess(result.Ok)
      } else {
        setError(result.Err)
      }
      await fetchNotes(actor)
    } catch (error) {
      console.error("Error deleting note:", error)
      setError("Error deleting note. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  const startEditing = (id, title, content) => {
    setEditingNoteId(id)
    setEditingTitle(title)
    setEditingContent(content)
  }

  const updateNote = async () => {
    if (!actor || editingNoteId === null || !editingTitle.trim() || !editingContent.trim()) return
    setLoading(true)
    clearMessages()
    try {
      const result = await actor.update_note(editingNoteId, {
        title: editingTitle.trim(),
        content: editingContent.trim(),
      })
      if (result.length > 0) {
        setSuccess("Note updated successfully!")
      } else {
        setError("Failed to update note.")
      }
      setEditingNoteId(null)
      setEditingTitle("")
      setEditingContent("")
      await fetchNotes(actor)
    } catch (error) {
      console.error("Error updating note:", error)
      setError("Error updating note. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  const loadNotes = () => {
    fetchNotes(actor)
  }

  const viewNote = (note) => {
    setViewingNote(note)
  }

  const exportNotes = () => {
    try {
      const jsonString = JSON.stringify(
        notes,
        (key, value) => (typeof value === "bigint" ? value.toString() : value),
        2,
      )
      const blob = new Blob([jsonString], { type: "application/json" })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = "ic_notes.json"
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      setSuccess("Notes exported successfully!")
    } catch (e) {
      console.error("Error exporting notes:", e)
      setError("Failed to export notes.")
    }
  }

  const filteredNotes = notes
    .filter((note) => {
      const query = searchQuery.toLowerCase()
      return (
        note.title.toLowerCase().includes(query) ||
        note.content.toLowerCase().includes(query) ||
        note.id.toString().includes(query)
      )
    })
    .sort((a, b) => {
      let valA, valB
      if (sortBy === "id") {
        valA = a.id
        valB = b.id
      } else if (sortBy === "title") {
        valA = a.title.toLowerCase()
        valB = b.title.toLowerCase()
      } else if (sortBy === "content") {
        valA = a.content.toLowerCase()
        valB = b.content.toLowerCase()
      }

      if (valA < valB) return sortOrder === "asc" ? -1 : 1
      if (valA > valB) return sortOrder === "asc" ? 1 : -1
      return 0
    })

  // Login screen
  if (!isAuthenticated) {
    return (
      <div
        style={{
          ...styles.container,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "1rem",
        }}
      >
        <div style={styles.loginCard}>
          <div
            style={{
              width: "80px",
              height: "80px",
              background: "linear-gradient(135deg, #667eea, #764ba2)",
              borderRadius: "50%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 2rem auto",
            }}
          >
            <Database size={40} color="white" />
          </div>
          <h1 style={{ fontSize: "2rem", fontWeight: "bold", marginBottom: "0.5rem", color: "#1f2937" }}>
            IC Notes Pro
          </h1>
          <p style={{ color: "#6b7280", marginBottom: "2rem" }}>Secure, decentralized notes with stable storage</p>
          {error && (
            <div
              style={{
                background: "#fee2e2",
                color: "#dc2626",
                padding: "0.75rem",
                borderRadius: "0.5rem",
                marginBottom: "1rem",
                fontSize: "0.875rem",
              }}
            >
              {error}
            </div>
          )}
          {success && (
            <div
              style={{
                background: "#dcfce7",
                color: "#16a34a",
                padding: "0.75rem",
                borderRadius: "0.5rem",
                marginBottom: "1rem",
                fontSize: "0.875rem",
              }}
            >
              {success}
            </div>
          )}
          <button
            onClick={login}
            style={{
              ...styles.button,
              width: "100%",
              fontSize: "1.1rem",
              padding: "1rem 2rem",
            }}
            disabled={loading}
          >
            {loading ? (
              "Connecting..."
            ) : (
              <>
                <User size={20} /> Connect with Internet Identity
              </>
            )}
          </button>
        </div>
      </div>
    )
  }

  // Main app
  return (
    <div style={styles.container}>
      {/* Header */}
      <header style={styles.header}>
        <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          <div
            style={{
              width: "40px",
              height: "40px",
              background: "linear-gradient(135deg, #667eea, #764ba2)",
              borderRadius: "8px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "white",
            }}
          >
            <Database size={20} />
          </div>
          <div>
            <h1 style={{ fontSize: "1.5rem", fontWeight: "bold", margin: 0, color: "#1f2937" }}>IC Notes Pro</h1>
            <p style={{ fontSize: "0.875rem", color: "#6b7280", margin: 0 }}>
              {notes.length} notes | {filteredNotes.length} filtered
            </p>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              fontSize: "0.875rem",
              color: "#6b7280",
              background: "rgba(102, 126, 234, 0.1)",
              padding: "0.5rem 1rem",
              borderRadius: "8px",
            }}
          >
            <User size={16} />
            <span style={{ fontFamily: "monospace" }}>
              {principal?.toString().slice(0, 8)}...{principal?.toString().slice(-8)}
            </span>
          </div>
          <button
            onClick={loadNotes}
            style={{
              ...styles.smallButton,
              background: "linear-gradient(135deg, #10b981, #059669)",
            }}
            disabled={loading}
          >
            <RefreshCw size={16} />
            {loading ? "Refreshing..." : "Refresh"}
          </button>
          <button
            onClick={logout}
            style={{
              ...styles.smallButton,
              background: "linear-gradient(135deg, #ef4444, #dc2626)",
            }}
            disabled={loading}
          >
            <LogOut size={16} />
            Logout
          </button>
        </div>
      </header>
      <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "2rem 1rem" }}>
        {/* Messages */}
        {error && (
          <div
            style={{
              background: "#fee2e2",
              color: "#dc2626",
              padding: "1rem",
              borderRadius: "0.5rem",
              marginBottom: "1rem",
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
            }}
          >
            <X size={16} />
            {error}
          </div>
        )}
        {success && (
          <div
            style={{
              background: "#dcfce7",
              color: "#16a34a",
              padding: "1rem",
              borderRadius: "0.5rem",
              marginBottom: "1rem",
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
            }}
          >
            ✓ {success}
          </div>
        )}
        {/* Controls */}
        <div
          style={{
            display: "flex",
            gap: "1rem",
            marginBottom: "2rem",
            flexWrap: "wrap",
            alignItems: "center",
            background: "rgba(255, 255, 255, 0.9)",
            padding: "1.5rem",
            borderRadius: "1rem",
          }}
        >
          <div style={{ position: "relative", flex: "1", maxWidth: "400px" }}>
            <div
              style={{
                position: "absolute",
                left: "0.75rem",
                top: "50%",
                transform: "translateY(-50%)",
                color: "#667eea",
              }}
            >
              <Search size={20} />
            </div>
            <input
              type="text"
              placeholder="Search notes by title, content, or ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                ...styles.input,
                paddingLeft: "2.5rem",
              }}
            />
          </div>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            style={{
              padding: "0.75rem",
              border: "2px solid rgba(102, 126, 234, 0.2)",
              borderRadius: "0.5rem",
              fontSize: "0.875rem",
              background: "rgba(255, 255, 255, 0.9)",
            }}
          >
            <option value="id">Sort by ID</option>
            <option value="title">Sort by Title</option>
            <option value="content">Sort by Content</option>
          </select>
          <button onClick={() => setSortOrder(sortOrder === "asc" ? "desc" : "asc")} style={styles.smallButton}>
            {sortOrder === "asc" ? <SortAsc size={16} /> : <SortDesc size={16} />}
          </button>
          <button
            onClick={exportNotes}
            style={{
              ...styles.smallButton,
              background: "linear-gradient(135deg, #8b5cf6, #7c3aed)",
            }}
            disabled={notes.length === 0}
          >
            <Download size={16} />
            Export
          </button>
          <button onClick={() => setShowAddForm(true)} style={styles.button}>
            <Plus size={20} />
            Add Note
          </button>
        </div>
        {/* Add Note Form */}
        {showAddForm && (
          <div style={{ ...styles.card, marginBottom: "2rem" }}>
            <h3 style={{ fontSize: "1.25rem", fontWeight: "600", marginBottom: "1rem", color: "#1f2937" }}>
              Create New Note
            </h3>
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: "0.875rem",
                    fontWeight: "500",
                    color: "#374151",
                    marginBottom: "0.5rem",
                  }}
                >
                  Title *
                </label>
                <input
                  type="text"
                  placeholder="Enter note title..."
                  value={newNote.title}
                  onChange={(e) => setNewNote({ ...newNote, title: e.target.value })}
                  style={styles.input}
                  maxLength={100}
                />
              </div>
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: "0.875rem",
                    fontWeight: "500",
                    color: "#374151",
                    marginBottom: "0.5rem",
                  }}
                >
                  Content *
                </label>
                <textarea
                  placeholder="Write your note content..."
                  value={newNote.content}
                  onChange={(e) => setNewNote({ ...newNote, content: e.target.value })}
                  style={styles.textarea}
                  rows="6"
                />
              </div>
              <div style={{ display: "flex", gap: "0.75rem" }}>
                <button
                  onClick={addNote}
                  disabled={loading || !newNote.title.trim() || !newNote.content.trim()}
                  style={{
                    ...styles.button,
                    background:
                      loading || !newNote.title.trim() || !newNote.content.trim()
                        ? "#9ca3af"
                        : "linear-gradient(135deg, #10b981, #059669)",
                    cursor: loading || !newNote.title.trim() || !newNote.content.trim() ? "not-allowed" : "pointer",
                  }}
                >
                  <Save size={16} />
                  {loading ? "Saving..." : "Save Note"}
                </button>
                <button
                  onClick={() => {
                    setShowAddForm(false)
                    setNewNote({ title: "", content: "" })
                  }}
                  style={{
                    ...styles.button,
                    background: "#6b7280",
                  }}
                >
                  <X size={16} />
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
        {/* Loading */}
        {loading && (
          <div style={{ textAlign: "center", padding: "2rem" }}>
            <div
              style={{
                width: "32px",
                height: "32px",
                border: "3px solid #e5e7eb",
                borderTop: "3px solid #667eea",
                borderRadius: "50%",
                animation: "spin 1s linear infinite",
                margin: "0 auto 1rem auto",
              }}
            ></div>
            <p style={{ color: "#6b7280" }}>Loading...</p>
          </div>
        )}
        {/* Empty State */}
        {notes.length === 0 && !loading && (
          <div style={{ textAlign: "center", padding: "3rem 1rem" }}>
            <Database size={64} color="#9ca3af" style={{ margin: "0 auto 1rem auto" }} />
            <h3 style={{ fontSize: "1.25rem", fontWeight: "600", color: "#1f2937", marginBottom: "0.5rem" }}>
              No notes yet
            </h3>
            <p style={{ color: "#6b7280", marginBottom: "1.5rem" }}>
              Create your first note to get started with secure, decentralized storage!
            </p>
            <button
              onClick={() => setShowAddForm(true)}
              style={{
                ...styles.button,
                fontSize: "1.1rem",
                padding: "1rem 2rem",
              }}
            >
              <Plus size={20} />
              Create First Note
            </button>
          </div>
        )}
        {/* Notes Grid */}
        {filteredNotes.length > 0 && (
          <div style={styles.grid}>
            {filteredNotes.map((note) => (
              <div
                key={note.id.toString()} // Use toString for key as BigInt cannot be directly used
                style={styles.card}
                onMouseOver={(e) => {
                  e.currentTarget.style.transform = "translateY(-4px)"
                  e.currentTarget.style.boxShadow = "0 15px 30px rgba(0, 0, 0, 0.15)"
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.transform = "translateY(0)"
                  e.currentTarget.style.boxShadow = "0 10px 20px rgba(0, 0, 0, 0.1)"
                }}
              >
                {/* Note ID Badge */}
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: "1rem",
                  }}
                >
                  <div
                    style={{
                      background: "linear-gradient(135deg, #667eea, #764ba2)",
                      color: "white",
                      padding: "0.25rem 0.75rem",
                      borderRadius: "20px",
                      fontSize: "0.75rem",
                      fontWeight: "600",
                      display: "flex",
                      alignItems: "center",
                      gap: "0.25rem",
                    }}
                  >
                    <Hash size={12} />
                    {note.id.toString()}
                  </div>
                </div>
                {editingNoteId === note.id ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                    <div>
                      <label
                        style={{
                          display: "block",
                          fontSize: "0.875rem",
                          fontWeight: "500",
                          color: "#374151",
                          marginBottom: "0.5rem",
                        }}
                      >
                        Title *
                      </label>
                      <input
                        type="text"
                        value={editingTitle}
                        onChange={(e) => setEditingTitle(e.target.value)}
                        style={styles.input}
                        maxLength={100}
                      />
                    </div>
                    <div>
                      <label
                        style={{
                          display: "block",
                          fontSize: "0.875rem",
                          fontWeight: "500",
                          color: "#374151",
                          marginBottom: "0.5rem",
                        }}
                      >
                        Content *
                      </label>
                      <textarea
                        value={editingContent}
                        onChange={(e) => setEditingContent(e.target.value)}
                        style={styles.textarea}
                        rows="6"
                      />
                    </div>
                    <div style={{ display: "flex", gap: "0.75rem" }}>
                      <button
                        onClick={updateNote}
                        disabled={loading || !editingTitle.trim() || !editingContent.trim()}
                        style={{
                          ...styles.smallButton,
                          background:
                            loading || !editingTitle.trim() || !editingContent.trim()
                              ? "#9ca3af"
                              : "linear-gradient(135deg, #10b981, #059669)",
                          cursor: loading || !editingTitle.trim() || !editingContent.trim() ? "not-allowed" : "pointer",
                        }}
                      >
                        <Save size={14} />
                        {loading ? "Updating..." : "Update"}
                      </button>
                      <button
                        onClick={() => setEditingNoteId(null)}
                        style={{
                          ...styles.smallButton,
                          background: "#6b7280",
                        }}
                      >
                        <X size={14} />
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <h3
                      style={{
                        fontSize: "1.125rem",
                        fontWeight: "600",
                        color: "#1f2937",
                        marginBottom: "0.75rem",
                        lineHeight: "1.4",
                      }}
                    >
                      {note.title}
                    </h3>
                    <p
                      style={{
                        color: "#6b7280",
                        lineHeight: "1.6",
                        marginBottom: "1.5rem",
                        display: "-webkit-box",
                        WebkitLineClamp: "3",
                        WebkitBoxOrient: "vertical",
                        overflow: "hidden",
                      }}
                    >
                      {note.content}
                    </p>
                    <div
                      style={{
                        display: "flex",
                        gap: "0.5rem",
                        paddingTop: "1rem",
                        borderTop: "1px solid #f3f4f6",
                      }}
                    >
                      <button
                        onClick={() => viewNote(note)}
                        style={{
                          ...styles.smallButton,
                          background: "linear-gradient(135deg, #8b5cf6, #7c3aed)",
                        }}
                      >
                        <Eye size={14} />
                        View
                      </button>
                      <button
                        onClick={() => startEditing(note.id, note.title, note.content)}
                        style={{
                          ...styles.smallButton,
                          background: "linear-gradient(135deg, #f59e0b, #d97706)",
                        }}
                      >
                        <Save size={14} />
                        Edit
                      </button>
                      <button
                        onClick={() => deleteNote(note.id)}
                        style={{
                          ...styles.smallButton,
                          background: "linear-gradient(135deg, #ef4444, #dc2626)",
                        }}
                      >
                        <Trash2 size={14} />
                        Delete
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
        {/* View Note Modal */}
        {viewingNote && (
          <div style={styles.modal} onClick={() => setViewingNote(null)}>
            <div style={styles.modalContent} onClick={(e) => e.stopPropagation()}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  marginBottom: "1rem",
                }}
              >
                <div>
                  <div
                    style={{
                      background: "linear-gradient(135deg, #667eea, #764ba2)",
                      color: "white",
                      padding: "0.5rem 1rem",
                      borderRadius: "20px",
                      fontSize: "0.875rem",
                      fontWeight: "600",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "0.5rem",
                      marginBottom: "1rem",
                    }}
                  >
                    <Hash size={14} />
                    ID: {viewingNote.id.toString()}
                  </div>
                  <h2 style={{ fontSize: "1.5rem", fontWeight: "bold", color: "#1f2937", marginBottom: "1rem" }}>
                    {viewingNote.title}
                  </h2>
                </div>
                <button
                  onClick={() => setViewingNote(null)}
                  style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    padding: "0.5rem",
                    borderRadius: "0.375rem",
                    color: "#6b7280",
                  }}
                >
                  <X size={24} />
                </button>
              </div>
              <div
                style={{
                  background: "#f9fafb",
                  padding: "1.5rem",
                  borderRadius: "0.5rem",
                  border: "1px solid #e5e7eb",
                  marginBottom: "1rem",
                }}
              >
                <p
                  style={{
                    color: "#374151",
                    lineHeight: "1.6",
                    whiteSpace: "pre-wrap",
                    margin: 0,
                  }}
                >
                  {viewingNote.content}
                </p>
              </div>
              <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
                <button
                  onClick={() => {
                    deleteNote(viewingNote.id)
                    setViewingNote(null)
                  }}
                  style={{
                    ...styles.smallButton,
                    background: "linear-gradient(135deg, #ef4444, #dc2626)",
                  }}
                >
                  <Trash2 size={14} />
                  Delete
                </button>
                <button
                  onClick={() => setViewingNote(null)}
                  style={{
                    ...styles.button,
                    background: "#6b7280",
                  }}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
      {/* CSS Animation */}
      <style>{`
      @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
    `}</style>
    </div>
  )
}
