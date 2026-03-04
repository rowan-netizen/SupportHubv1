/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { 
  Folder, 
  FileText, 
  Search, 
  Plus, 
  ChevronRight, 
  ChevronDown, 
  Settings, 
  Bell, 
  Clock, 
  Trash2, 
  Edit3, 
  Save, 
  X,
  Users,
  AlertTriangle,
  ChevronLeft,
  Upload,
  FileUp,
  MoreVertical,
  GripVertical,
  CheckSquare,
  Square,
  Shield,
  UserPlus,
  Lock,
  Type,
  List,
  Quote,
  Code,
  Table as TableIcon,
  Image as ImageIcon,
  ChevronDownSquare,
  Info,
  Smile,
  AlertCircle,
  CheckCircle2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import { format, isPast, parseISO } from 'date-fns';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Placeholder } from '@tiptap/extension-placeholder';
import { Link } from '@tiptap/extension-link';
import { Image } from '@tiptap/extension-image';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableHeader } from '@tiptap/extension-table-header';
import { TableCell } from '@tiptap/extension-table-cell';
import { Underline } from '@tiptap/extension-underline';
import { TaskList } from '@tiptap/extension-task-list';
import { TaskItem } from '@tiptap/extension-task-item';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- Types ---

interface Team {
  id: number;
  name: string;
}

interface User {
  id: number;
  name: string;
  email: string;
  team_id: number | null;
  team_name?: string;
  role: 'admin' | 'editor' | 'viewer';
}

interface FolderAccess {
  folder_id: number;
  team_id: number;
}

interface Announcement {
  id: number;
  message: string;
  article_id: number | null;
  article_title?: string;
  team_id: number | null;
  sender_id: number;
  sender_name?: string;
  created_at: string;
}

interface FolderType {
  id: number;
  name: string;
  parent_id: number | null;
}

interface Article {
  id: number;
  title: string;
  content: string;
  tags?: string;
  folder_id: number | null;
  created_at: string;
  updated_at: string;
  expires_at: string | null;
  team_access?: number[];
}

// --- Components ---

export default function App() {
  const [folders, setFolders] = useState<FolderType[]>([]);
  const [articles, setArticles] = useState<Article[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<number | null>(null);
  const [expandedFolderIds, setExpandedFolderIds] = useState<number[]>([]);
  const [selectedArticleId, setSelectedArticleId] = useState<number | null>(null);
  const [selectedArticleIds, setSelectedArticleIds] = useState<number[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [isCreatingArticle, setIsCreatingArticle] = useState(false);
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [editingFolderId, setEditingFolderId] = useState<number | null>(null);
  const [editFolderName, setEditFolderName] = useState('');
  const [showExpirationAlerts, setShowExpirationAlerts] = useState(false);
  
  // Form states
  const [editArticle, setEditArticle] = useState<Partial<Article>>({});
  const [newFolderName, setNewFolderName] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const [folderAccess, setFolderAccess] = useState<FolderAccess[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [showAnnouncements, setShowAnnouncements] = useState(false);
  const [isAnnouncing, setIsAnnouncing] = useState(false);
  const [announcementMessage, setAnnouncementMessage] = useState('');
  const [announcementTeamId, setAnnouncementTeamId] = useState<number | null>(null);
  const [importPreview, setImportPreview] = useState<any | null>(null);
  const [importStatus, setImportStatus] = useState<'success' | 'error' | null>(null);
  const [importErrorMessage, setImportErrorMessage] = useState('');

  // Fetch initial data
  useEffect(() => {
    console.log("KB App Version: 1.1.0 - Drag and Drop Enabled");
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const res = await fetch('/api/initial-data');
      
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Failed to fetch initial data: ${res.status}\nBody: ${text.slice(0, 100)}`);
      }

      const data = await res.json();
      setFolders(data.folders);
      setTeams(data.teams);
      setArticles(data.articles);
      setUsers(data.users || []);
      setFolderAccess(data.folderAccess || []);
      setAnnouncements(data.announcements || []);
      
      // Identify current user (demo logic)
      const userEmail = 'rowan@creativefabrica.com'; // From context
      const foundUser = data.users?.find((u: User) => u.email === userEmail);
      if (foundUser) {
        setCurrentUser(foundUser);
      } else if (data.users?.length > 0) {
        setCurrentUser(data.users[0]); // Fallback to first user
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    }
  };

  const lastFetchRef = React.useRef<string>('');

  const handleSendAnnouncement = async () => {
    if (!announcementMessage || !currentUser) return;
    try {
      const res = await fetch('/api/announcements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: announcementMessage,
          article_id: selectedArticleId,
          team_id: announcementTeamId,
          sender_id: currentUser.id
        })
      });
      if (res.ok) {
        setIsAnnouncing(false);
        setAnnouncementMessage('');
        setAnnouncementTeamId(null);
        // Refresh announcements
        const aRes = await fetch('/api/announcements');
        if (aRes.ok) setAnnouncements(await aRes.json());
      }
    } catch (err) {
      console.error(err);
    }
  };

  const filteredAnnouncements = useMemo(() => {
    if (!currentUser) return announcements;
    return announcements.filter(a => a.team_id === null || a.team_id === currentUser.team_id);
  }, [announcements, currentUser]);

  const fetchArticles = async (folderId: number | null = null, search: string = '', force: boolean = false) => {
    const fetchKey = `${folderId}-${search}`;
    if (!force && lastFetchRef.current === fetchKey) return;
    lastFetchRef.current = fetchKey;

    try {
      const url = new URL('/api/articles', window.location.origin);
      if (search) url.searchParams.append('search', search);
      else if (folderId) url.searchParams.append('folder_id', folderId.toString());
      
      const res = await fetch(url.toString());
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Failed to fetch articles: ${res.status}\nBody: ${text.slice(0, 100)}`);
      }
      setArticles(await res.json());
    } catch (error) {
      console.error('Error fetching articles:', error);
    } finally {
      // Reset after a short delay to allow future fetches
      setTimeout(() => {
        if (lastFetchRef.current === fetchKey) {
          lastFetchRef.current = '';
        }
      }, 500);
    }
  };

  const handleFolderClick = (id: number | null) => {
    setSelectedFolderId(id);
    setSelectedArticleId(null);
    setSelectedArticleIds([]);
    setIsEditing(false);
    setIsCreatingArticle(false);
    setSearchQuery('');
    fetchArticles(id);
    
    if (id !== null) {
      setExpandedFolderIds(prev => 
        prev.includes(id) ? prev : [...prev, id]
      );
    }
  };

  const toggleFolderExpansion = (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    setExpandedFolderIds(prev => 
      prev.includes(id) ? prev.filter(fid => fid !== id) : [...prev, id]
    );
  };

  const handleArticleClick = async (id: number, isMultiSelect: boolean = false) => {
    if (!id) return;
    
    if (isMultiSelect) {
      setSelectedArticleIds(prev => 
        prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
      );
      return;
    }

    try {
      const res = await fetch(`/api/articles/${id}`);
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Failed to fetch article details: ${res.status}\nBody: ${text.slice(0, 100)}`);
      }
      const data = await res.json();
      setSelectedArticleId(id);
      setSelectedArticleIds([id]);
      setEditArticle(data);
      setIsEditing(false);
      setIsCreatingArticle(false);
    } catch (error) {
      console.error('Error fetching article details:', error);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSelectedFolderId(null);
    setSelectedArticleId(null);
    setSelectedArticleIds([]);
    fetchArticles(null, searchQuery);
  };

  const handleSaveArticle = async () => {
    const method = editArticle.id ? 'PUT' : 'POST';
    const url = editArticle.id ? `/api/articles/${editArticle.id}` : '/api/articles';
    
    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...editArticle,
          folder_id: editArticle.folder_id || selectedFolderId,
          tags: editArticle.tags
        })
      });
      
      if (res.ok) {
        setIsEditing(false);
        setIsCreatingArticle(false);
        fetchArticles(selectedFolderId, '', true);
        if (editArticle.id) {
          handleArticleClick(editArticle.id);
        }
      }
    } catch (error) {
      console.error('Error saving article:', error);
    }
  };

  const handleDeleteArticle = async (id: number) => {
    if (!confirm('Are you sure you want to delete this article?')) return;
    try {
      const res = await fetch(`/api/articles/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete article');
      
      setSelectedArticleIds(prev => prev.filter(i => i !== id));
      if (selectedArticleId === id) {
        setSelectedArticleId(null);
      }
      fetchArticles(selectedFolderId, '', true);
    } catch (error) {
      console.error('Error deleting article:', error);
    }
  };

  const handleBatchDelete = async () => {
    if (selectedArticleIds.length === 0) return;
    if (!confirm(`Are you sure you want to delete ${selectedArticleIds.length} articles?`)) return;

    try {
      const res = await fetch('/api/articles/batch-delete', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ article_ids: selectedArticleIds })
      });

      if (res.ok) {
        if (selectedArticleId && selectedArticleIds.includes(selectedArticleId)) {
          setSelectedArticleId(null);
        }
        setSelectedArticleIds([]);
        fetchArticles(selectedFolderId, '', true);
      }
    } catch (error) {
      console.error('Error batch deleting articles:', error);
    }
  };

  const handleDeleteFolder = async (id: number) => {
    if (!confirm('Are you sure you want to delete this folder and all its contents?')) return;
    try {
      const res = await fetch(`/api/folders/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete folder');
      
      if (selectedFolderId === id) {
        setSelectedFolderId(null);
      }
      setFolders(prev => prev.filter(f => f.id !== id));
      setExpandedFolderIds(prev => prev.filter(fid => fid !== id));
      fetchArticles(null, '', true);
    } catch (error) {
      console.error('Error deleting folder:', error);
    }
  };

  const handleCreateFolder = async () => {
    if (!newFolderName) return;
    try {
      await fetch('/api/folders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newFolderName, parent_id: selectedFolderId })
      });
      setNewFolderName('');
      setIsCreatingFolder(false);
      const fRes = await fetch('/api/folders');
      setFolders(await fRes.json());
    } catch (error) {
      console.error('Error creating folder:', error);
    }
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const MAX_SIZE = 30 * 1024 * 1024; // 30MB
    if (file.size > MAX_SIZE) {
      alert(`File is too large (max 30MB): ${file.name}`);
      e.target.value = '';
      return;
    }

    const formData = new FormData();
    formData.append('file', file);
    
    setIsImporting(true);
    try {
      const res = await fetch('/api/import/preview', {
        method: 'POST',
        headers: { 'Accept': 'application/json' },
        body: formData,
      });

      if (res.ok) {
        const data = await res.json();
        setImportPreview(data);
      } else {
        const errorText = await res.text();
        alert(`Failed to load preview: ${errorText}`);
      }
    } catch (error) {
      console.error('Import preview error:', error);
      alert('Failed to connect to server for preview.');
    } finally {
      setIsImporting(false);
      e.target.value = ''; // Reset input
    }
  };

  const handleConfirmImport = async () => {
    if (!importPreview) return;
    
    setIsImporting(true);
    try {
      const res = await fetch('/api/import/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tempId: importPreview.tempId,
          structure: importPreview.structure,
          folderId: selectedFolderId
        })
      });

      if (res.ok) {
        setImportStatus('success');
        setImportPreview(null);
        fetchData(); // Refresh all data
        setTimeout(() => setImportStatus(null), 3000);
      } else {
        const data = await res.json();
        setImportStatus('error');
        setImportErrorMessage(data.error || 'Import failed');
        setTimeout(() => setImportStatus(null), 5000);
      }
    } catch (error) {
      setImportStatus('error');
      setImportErrorMessage('Network error during import');
      setTimeout(() => setImportStatus(null), 5000);
    } finally {
      setIsImporting(false);
    }
  };

  const handleRenameFolder = async (id: number) => {
    if (!editFolderName) return;
    const folder = folders.find(f => f.id === id);
    if (!folder) return;

    try {
      await fetch(`/api/folders/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editFolderName, parent_id: folder.parent_id })
      });
      setEditingFolderId(null);
      const fRes = await fetch('/api/folders');
      setFolders(await fRes.json());
    } catch (error) {
      console.error('Error renaming folder:', error);
    }
  };

  const handleMoveFolder = async (id: number, newParentId: number | null) => {
    if (id === newParentId) return;
    
    // Prevent circular parenting
    const isDescendant = (folderId: number, targetParentId: number | null): boolean => {
      if (targetParentId === null) return false;
      const parent = folders.find(f => f.id === targetParentId);
      if (!parent) return false;
      if (parent.parent_id === folderId) return true;
      return isDescendant(folderId, parent.parent_id);
    };

    if (isDescendant(id, newParentId)) {
      alert("Cannot move a folder into its own descendant.");
      return;
    }

    const folder = folders.find(f => f.id === id);
    if (!folder) return;

    try {
      await fetch(`/api/folders/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: folder.name, parent_id: newParentId })
      });
      const fRes = await fetch('/api/folders');
      setFolders(await fRes.json());
    } catch (error) {
      console.error('Error moving folder:', error);
    }
  };

  const handleBatchMoveArticles = async (folderId: number | null) => {
    if (selectedArticleIds.length === 0) return;
    try {
      await fetch('/api/articles/batch-move', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ article_ids: selectedArticleIds, folder_id: folderId })
      });
      fetchArticles(selectedFolderId, '', true);
      setSelectedArticleIds([]);
    } catch (error) {
      console.error('Error moving articles:', error);
    }
  };

  const [dragOverFolderId, setDragOverFolderId] = useState<number | null | 'root'>(null);

  const handleDragStart = (e: React.DragEvent, type: 'folder' | 'article', id: number) => {
    e.dataTransfer.setData('type', type);
    e.dataTransfer.setData('id', id.toString());
    e.dataTransfer.effectAllowed = 'move';
    
    if (type === 'article' && !selectedArticleIds.includes(id)) {
      setSelectedArticleIds([id]);
    }
  };

  const handleDragOver = (e: React.DragEvent, folderId: number | null | 'root') => {
    e.preventDefault();
    setDragOverFolderId(folderId);
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDragLeave = () => {
    setDragOverFolderId(null);
  };

  const handleDrop = async (e: React.DragEvent, targetFolderId: number | null) => {
    e.preventDefault();
    setDragOverFolderId(null);
    const type = e.dataTransfer.getData('type');
    const id = parseInt(e.dataTransfer.getData('id'));

    if (type === 'folder') {
      await handleMoveFolder(id, targetFolderId);
    } else if (type === 'article') {
      // If we have multiple selected articles, move all of them
      const idsToMove = selectedArticleIds.length > 0 ? selectedArticleIds : [id];
      try {
        await fetch('/api/articles/batch-move', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ article_ids: idsToMove, folder_id: targetFolderId })
        });
        fetchArticles(selectedFolderId, '', true);
        setSelectedArticleIds([]);
      } catch (error) {
        console.error('Error moving articles:', error);
      }
    }
  };

  const expiredArticles = useMemo(() => {
    return articles.filter(a => a.expires_at && isPast(parseISO(a.expires_at)));
  }, [articles]);

  return (
    <div className="flex h-screen bg-[#F5F5F5] text-[#1A1A1A] font-sans overflow-hidden">
      {/* Sidebar */}
      <aside className="w-20 bg-white border-r border-black/5 flex flex-col items-center py-6 gap-6">
        <div className="w-10 h-10 bg-black rounded-xl flex items-center justify-center mb-4">
          <FileText className="text-white w-6 h-6" />
        </div>
        
        <div className="flex-1 flex flex-col gap-4">
          <button 
            onClick={() => handleFolderClick(null)}
            className={cn(
              "p-3 rounded-2xl transition-all group relative",
              selectedFolderId === null && !searchQuery && !showAdmin && !showAnnouncements ? "bg-black text-white shadow-lg" : "hover:bg-black/5 text-black/40 hover:text-black"
            )}
            title="All Knowledge"
          >
            <Folder className="w-5 h-5" />
            <span className="absolute left-full ml-4 px-2 py-1 bg-black text-white text-[10px] rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-50">All Knowledge</span>
          </button>

          <button 
            onClick={() => { setShowAnnouncements(!showAnnouncements); setShowAdmin(false); setShowExpirationAlerts(false); }}
            className={cn(
              "p-3 rounded-2xl transition-all group relative",
              showAnnouncements ? "bg-black text-white shadow-lg" : "hover:bg-black/5 text-black/40 hover:text-black"
            )}
            title="Announcements"
          >
            <Bell className="w-5 h-5" />
            {filteredAnnouncements.length > 0 && !showAnnouncements && (
              <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full border-2 border-white" />
            )}
            <span className="absolute left-full ml-4 px-2 py-1 bg-black text-white text-[10px] rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-50">Announcements</span>
          </button>

          <button 
            onClick={() => { setShowAdmin(!showAdmin); setShowAnnouncements(false); setShowExpirationAlerts(false); }}
            className={cn(
              "p-3 rounded-2xl transition-all group relative",
              showAdmin ? "bg-black text-white shadow-lg" : "hover:bg-black/5 text-black/40 hover:text-black"
            )}
            title="Admin Panel"
          >
            <Users className="w-5 h-5" />
            <span className="absolute left-full ml-4 px-2 py-1 bg-black text-white text-[10px] rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-50">Admin Panel</span>
          </button>

          <button 
            onClick={() => setShowExpirationAlerts(!showExpirationAlerts)}
            className={cn(
              "p-3 rounded-2xl transition-all group relative",
              showExpirationAlerts ? "bg-amber-500 text-white shadow-lg" : "hover:bg-black/5 text-black/40 hover:text-black"
            )}
            title="Expiration Alerts"
          >
            <Clock className="w-5 h-5" />
            {expiredArticles.length > 0 && (
              <span className="absolute -top-1 -right-1 bg-amber-500 text-white text-[8px] px-1 rounded-full font-bold border border-white">
                {expiredArticles.length}
              </span>
            )}
            <span className="absolute left-full ml-4 px-2 py-1 bg-black text-white text-[10px] rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-50">Expiration Alerts</span>
          </button>
        </div>

        <div className="mt-auto flex flex-col items-center gap-4 mb-4">
          <span className="text-[8px] font-bold text-black/10 uppercase tracking-widest">v1.1.0</span>
          <button className="p-3 rounded-2xl hover:bg-black/5 text-black/40 hover:text-black transition-all group relative" title="Settings">
            <Settings className="w-5 h-5" />
            <span className="absolute left-full ml-4 px-2 py-1 bg-black text-white text-[10px] rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-50">Settings</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden bg-white">
        {/* Header */}
        <header className="h-20 border-b border-black/5 flex items-center justify-between px-8 shrink-0">
          <div className="flex items-center gap-8">
            <div>
              <h2 className="text-xl font-semibold tracking-tight">
                {showAdmin ? "Admin Panel" : 
                 showAnnouncements ? "Announcements" :
                 searchQuery ? `Search results for "${searchQuery}"` : 
                 selectedFolderId ? folders.find(f => f.id === selectedFolderId)?.name : 
                 "All Knowledge"}
              </h2>
              <p className="text-xs text-black/40 mt-0.5">
                {showAdmin ? "Manage users, groups, and permissions" : 
                 showAnnouncements ? "Stay updated with the latest changes" :
                 `${articles.length} articles found`}
              </p>
            </div>

            {!showAdmin && !showAnnouncements && (
              <form onSubmit={handleSearch} className="relative w-80">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-black/40" />
                <input 
                  type="text" 
                  placeholder="Search knowledge..."
                  className="w-full bg-[#F5F5F5] border-none rounded-xl py-2 pl-10 pr-4 text-sm focus:ring-2 focus:ring-black/5 outline-none transition-all"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </form>
            )}
          </div>

          {!showAdmin && !showAnnouncements && (
            <div className="flex items-center gap-3">
              {selectedArticleIds.length > 0 && (
                <button 
                  onClick={handleBatchDelete}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-red-500 border border-red-100 bg-red-50 hover:bg-red-100 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                  Delete Selected ({selectedArticleIds.length})
                </button>
              )}
              <label className={cn(
                "cursor-pointer px-4 py-2 rounded-xl text-sm font-medium border border-black/10 hover:bg-black/5 transition-colors flex items-center gap-2",
                isImporting && "opacity-50 cursor-not-allowed"
              )}>
                <FileUp className="w-4 h-4" />
                {isImporting ? 'Importing...' : 'Import'}
                <input 
                  type="file" 
                  className="hidden" 
                  accept=".pdf,.yaml,.yml,.html,.htm,.zip" 
                  onChange={handleImportFile}
                  disabled={isImporting}
                  multiple
                />
              </label>
              <button 
                onClick={() => {
                  setIsCreatingArticle(true);
                  setEditArticle({ title: '', content: '', team_access: [], folder_id: selectedFolderId });
                  setSelectedArticleId(null);
                }}
                className="bg-black text-white px-4 py-2 rounded-xl text-sm font-medium flex items-center gap-2 hover:bg-black/80 transition-colors"
              >
                <Plus className="w-4 h-4" />
                New Article
              </button>
            </div>
          )}
        </header>

        {/* Import Preview Modal */}
        <AnimatePresence>
          {importPreview && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setImportPreview(null)}
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              />
              <motion.div 
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                className="relative w-full max-w-2xl bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh]"
              >
                <div className="p-6 border-b border-black/5 flex items-center justify-between bg-[#FAFAFA]">
                  <div>
                    <h3 className="text-xl font-bold tracking-tight">Import Preview</h3>
                    <p className="text-xs text-black/40 mt-1">Review and rename items before importing</p>
                  </div>
                  <button 
                    onClick={() => setImportPreview(null)}
                    className="p-2 hover:bg-black/5 rounded-full transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto p-6">
                  <div className="bg-[#F5F5F5] rounded-2xl p-4 border border-black/5">
                    <ImportPreviewTree 
                      item={importPreview.structure} 
                      onChange={(updated) => setImportPreview({ ...importPreview, structure: updated })}
                    />
                  </div>
                </div>

                <div className="p-6 border-t border-black/5 bg-[#FAFAFA] flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs text-black/40">
                    <Info className="w-4 h-4" />
                    <span>Importing into: {selectedFolderId ? folders.find(f => f.id === selectedFolderId)?.name : 'Root'}</span>
                  </div>
                  <div className="flex gap-3">
                    <button 
                      onClick={() => setImportPreview(null)}
                      className="px-6 py-2.5 rounded-xl text-sm font-bold hover:bg-black/5 transition-colors"
                    >
                      Cancel
                    </button>
                    <button 
                      onClick={handleConfirmImport}
                      disabled={isImporting}
                      className="bg-black text-white px-8 py-2.5 rounded-xl text-sm font-bold hover:bg-black/80 transition-all shadow-lg shadow-black/10 flex items-center gap-2 disabled:opacity-50"
                    >
                      {isImporting ? 'Importing...' : 'Confirm Import'}
                    </button>
                  </div>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Status Toast */}
        <AnimatePresence>
          {importStatus && (
            <motion.div 
              initial={{ opacity: 0, y: 50 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 50 }}
              className={cn(
                "fixed bottom-8 right-8 z-[110] px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-4 border",
                importStatus === 'success' ? "bg-emerald-500 text-white border-emerald-400" : "bg-red-500 text-white border-red-400"
              )}
            >
              {importStatus === 'success' ? (
                <CheckCircle2 className="w-6 h-6" />
              ) : (
                <AlertCircle className="w-6 h-6" />
              )}
              <div>
                <p className="font-bold text-sm">
                  {importStatus === 'success' ? 'Import Successful' : 'Import Failed'}
                </p>
                <p className="text-xs opacity-90">
                  {importStatus === 'success' ? 'Your knowledge base has been updated.' : importErrorMessage}
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        {/* Content Area */}
        <div className="flex-1 flex overflow-hidden">
          {showAdmin ? (
            <AdminPanel 
              users={users} 
              teams={teams} 
              folders={folders} 
              articles={articles}
              folderAccess={folderAccess} 
              onUpdateUsers={(newUsers) => setUsers(newUsers)}
              onUpdateTeams={(newTeams) => setTeams(newTeams)}
              onUpdateFolderAccess={(newAccess) => setFolderAccess(newAccess)}
              onUpdateArticles={(newArticles) => setArticles(newArticles)}
            />
          ) : showAnnouncements ? (
            <div className="flex-1 overflow-y-auto bg-[#FAFAFA] p-8">
              <div className="max-w-3xl mx-auto space-y-4">
                {filteredAnnouncements.length === 0 ? (
                  <div className="text-center py-20">
                    <Bell className="w-12 h-12 text-black/5 mx-auto mb-4" />
                    <p className="text-black/40">No announcements yet.</p>
                  </div>
                ) : (
                  filteredAnnouncements.map(a => (
                    <div key={a.id} className="bg-white p-6 rounded-2xl border border-black/5 shadow-sm space-y-3">
                      <div className="flex justify-between items-start">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 bg-black/5 rounded-full flex items-center justify-center text-xs font-bold">
                            {a.sender_name?.[0]}
                          </div>
                          <div>
                            <p className="text-sm font-semibold">{a.sender_name}</p>
                            <p className="text-[10px] text-black/40 uppercase font-bold tracking-wider">
                              {format(parseISO(a.created_at), 'MMM d, h:mm a')}
                            </p>
                          </div>
                        </div>
                        {a.team_id && (
                          <span className="bg-blue-50 text-blue-600 text-[10px] font-bold px-2 py-1 rounded uppercase">
                            {teams.find(t => t.id === a.team_id)?.name}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-black/70 leading-relaxed">{a.message}</p>
                      {a.article_id && (
                        <button 
                          onClick={() => {
                            setSelectedArticleId(a.article_id);
                            setShowAnnouncements(false);
                          }}
                          className="flex items-center gap-2 text-xs font-medium text-black/40 hover:text-black transition-colors"
                        >
                          <FileText className="w-3.5 h-3.5" />
                          View Article: {a.article_title}
                        </button>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          ) : (
            <div className="flex-1 flex overflow-hidden">
              {/* One Column Navigation */}
              <div className="w-80 border-r border-black/5 flex flex-col bg-white shrink-0">
                <div 
                  className={cn(
                    "p-4 border-b border-black/5 flex items-center justify-between bg-white transition-colors",
                    dragOverFolderId === 'root' && "bg-emerald-50"
                  )}
                  onDragOver={(e) => handleDragOver(e, 'root')}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => {
                    const current = folders.find(f => f.id === selectedFolderId);
                    handleDrop(e, current?.parent_id || null);
                  }}
                >
                  <div className="flex items-center gap-2 overflow-hidden">
                    {selectedFolderId && (
                      <button 
                        onClick={() => {
                          const current = folders.find(f => f.id === selectedFolderId);
                          handleFolderClick(current?.parent_id || null);
                        }}
                        className="p-1 hover:bg-black/5 rounded transition-colors shrink-0"
                      >
                        <ChevronLeft className="w-4 h-4 text-black/40" />
                      </button>
                    )}
                    <span className="text-[10px] font-bold uppercase tracking-wider text-black/40 truncate">
                      {selectedFolderId ? folders.find(f => f.id === selectedFolderId)?.name : 'Knowledge Base'}
                    </span>
                  </div>
                  <div className="flex gap-1">
                    <button 
                      onClick={() => setIsCreatingFolder(true)} 
                      className="flex items-center gap-1 px-2 py-1 hover:bg-black/5 rounded transition-colors text-black/40 hover:text-black"
                      title="New Folder"
                    >
                      <Plus className="w-3 h-3" />
                      <span className="text-[10px] font-bold uppercase">New</span>
                    </button>
                  </div>
                </div>
                
                <div className="flex-1 overflow-y-auto p-2 space-y-4">
                  {isCreatingFolder && (
                    <div className="px-3 py-2 space-y-2 bg-black/5 rounded-xl">
                      <input 
                        autoFocus
                        type="text" 
                        placeholder="New folder name..."
                        className="w-full text-sm bg-transparent border-b border-black/10 outline-none py-1"
                        value={newFolderName}
                        onChange={(e) => setNewFolderName(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleCreateFolder()}
                      />
                      <div className="flex gap-2">
                        <button onClick={handleCreateFolder} className="text-[10px] font-bold uppercase text-emerald-600">Save</button>
                        <button onClick={() => setIsCreatingFolder(false)} className="text-[10px] font-bold uppercase text-red-600">Cancel</button>
                      </div>
                    </div>
                  )}

                  {/* Folders Section */}
                  <div className="space-y-1">
                    {selectedFolderId && folders.some(f => f.parent_id === selectedFolderId) && (
                      <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-black/20">Subfolders</div>
                    )}
                    {folders.filter(f => f.parent_id === selectedFolderId).map(folder => (
                      <div key={folder.id} className="group relative">
                        <button
                          draggable
                          onDragStart={(e) => handleDragStart(e, 'folder', folder.id)}
                          onDragOver={(e) => handleDragOver(e, folder.id)}
                          onDragLeave={handleDragLeave}
                          onDrop={(e) => handleDrop(e, folder.id)}
                          onClick={() => handleFolderClick(folder.id)}
                          className={cn(
                            "w-full flex items-center justify-between px-3 py-2 rounded-xl text-sm font-medium hover:bg-black/5 text-black/70 transition-all",
                            dragOverFolderId === folder.id && "bg-emerald-50 text-emerald-700 ring-2 ring-emerald-200 ring-inset"
                          )}
                        >
                          <div className="flex items-center gap-2 overflow-hidden">
                            <Folder className={cn("w-4 h-4 shrink-0", dragOverFolderId === folder.id ? "text-emerald-500" : "text-black/20")} />
                            {editingFolderId === folder.id ? (
                              <input 
                                autoFocus
                                className="bg-transparent border-none outline-none text-black w-full"
                                value={editFolderName}
                                onChange={(e) => setEditFolderName(e.target.value)}
                                onBlur={() => handleRenameFolder(folder.id)}
                                onKeyDown={(e) => e.key === 'Enter' && handleRenameFolder(folder.id)}
                                onClick={(e) => e.stopPropagation()}
                              />
                            ) : <span className="truncate">{folder.name}</span>}
                          </div>
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                            <button 
                              onClick={(e) => { e.stopPropagation(); setEditingFolderId(folder.id); setEditFolderName(folder.name); }}
                              className="p-1 hover:bg-black/10 rounded transition-colors"
                              title="Rename"
                            >
                              <Edit3 className="w-3 h-3 text-black/40 hover:text-black" />
                            </button>
                            <button 
                              onClick={(e) => { e.stopPropagation(); handleDeleteFolder(folder.id); }}
                              className="p-1 hover:bg-red-50 rounded transition-colors"
                              title="Delete"
                            >
                              <Trash2 className="w-3 h-3 text-black/40 hover:text-red-500" />
                            </button>
                            <ChevronRight className="w-3 h-3 text-black/20" />
                          </div>
                        </button>
                      </div>
                    ))}
                  </div>

                  {/* Articles Section */}
                  <div className="space-y-1">
                    {selectedFolderId && articles.length > 0 && (
                      <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-black/20">Articles</div>
                    )}
                    {articles.map(article => (
                      <button
                        key={article.id}
                        draggable
                        onDragStart={(e) => handleDragStart(e, 'article', article.id)}
                        onClick={(e) => handleArticleClick(article.id, e.shiftKey || e.metaKey || e.ctrlKey)}
                        className={cn(
                          "w-full text-left p-3 rounded-xl transition-all group relative",
                          selectedArticleId === article.id ? "bg-black text-white shadow-lg" : "hover:bg-black/5 text-black/70",
                          selectedArticleIds.includes(article.id) && "ring-1 ring-black/10"
                        )}
                      >
                        <div className="flex items-center gap-2">
                          <FileText className={cn("w-4 h-4 shrink-0", selectedArticleId === article.id ? "text-white/40" : "text-black/20")} />
                          <span className="text-sm font-medium line-clamp-1">{article.title || "Untitled"}</span>
                        </div>
                      </button>
                    ))}
                    {articles.length === 0 && selectedFolderId && !folders.some(f => f.parent_id === selectedFolderId) && (
                      <div className="px-3 py-10 text-center opacity-20">
                        <FileText className="w-8 h-8 mx-auto mb-2" />
                        <p className="text-[10px] font-bold uppercase">Folder is empty</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Article Detail / Editor Area */}
              <div className="flex-1 overflow-y-auto bg-white">
                <AnimatePresence mode="wait">
                  {isEditing || isCreatingArticle ? (
                    <motion.div 
                      key="editor"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="p-10 max-w-4xl mx-auto space-y-8"
                    >
                      <div className="flex items-center justify-between">
                        <button 
                          onClick={() => { setIsEditing(false); setIsCreatingArticle(false); }}
                          className="text-sm text-black/40 hover:text-black flex items-center gap-1"
                        >
                          <ChevronLeft className="w-4 h-4" />
                          Back
                        </button>
                        <div className="flex gap-2">
                          {isEditing && (
                            <button 
                              onClick={() => setIsAnnouncing(true)}
                              className="px-4 py-2 rounded-xl text-sm font-medium border border-black/10 hover:bg-black/5 transition-colors flex items-center gap-2"
                            >
                              <Bell className="w-4 h-4" />
                              Announce Update
                            </button>
                          )}
                          <button 
                            onClick={handleSaveArticle}
                            className="bg-black text-white px-6 py-2 rounded-xl text-sm font-medium hover:bg-black/80 transition-colors flex items-center gap-2"
                          >
                            <Save className="w-4 h-4" />
                            Save Changes
                          </button>
                        </div>
                      </div>

                      <div className="space-y-6">
                        <input 
                          type="text" 
                          placeholder="Article Title"
                          className="w-full text-4xl font-bold tracking-tight border-none outline-none placeholder:text-black/10"
                          value={editArticle.title}
                          onChange={(e) => setEditArticle({ ...editArticle, title: e.target.value })}
                        />

                        <div className="grid grid-cols-3 gap-8 py-6 border-y border-black/5">
                          <div className="space-y-2">
                            <label className="text-[10px] font-bold uppercase tracking-wider text-black/40 flex items-center gap-1.5">
                              <Clock className="w-3 h-3" />
                              Expiration Date
                            </label>
                            <input 
                              type="date" 
                              className="w-full bg-[#F5F5F5] border-none rounded-lg px-3 py-2 text-sm outline-none"
                              value={editArticle.expires_at?.split('T')[0] || ''}
                              onChange={(e) => setEditArticle({ ...editArticle, expires_at: e.target.value })}
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="text-[10px] font-bold uppercase tracking-wider text-black/40 flex items-center gap-1.5">
                              <Settings className="w-3 h-3" />
                              Tags
                            </label>
                            <input 
                              type="text" 
                              placeholder="e.g. tech, billing"
                              className="w-full bg-[#F5F5F5] border-none rounded-lg px-3 py-2 text-sm outline-none"
                              value={editArticle.tags || ''}
                              onChange={(e) => setEditArticle({ ...editArticle, tags: e.target.value })}
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="text-[10px] font-bold uppercase tracking-wider text-black/40 flex items-center gap-1.5">
                              <Users className="w-3 h-3" />
                              Team Access
                            </label>
                            <div className="flex flex-wrap gap-2">
                              {teams.map(team => (
                                <button
                                  key={team.id}
                                  onClick={() => {
                                    const current = editArticle.team_access || [];
                                    const next = current.includes(team.id) 
                                      ? current.filter(id => id !== team.id)
                                      : [...current, team.id];
                                    setEditArticle({ ...editArticle, team_access: next });
                                  }}
                                  className={cn(
                                    "px-2.5 py-1 rounded-full text-[10px] font-bold border transition-all",
                                    editArticle.team_access?.includes(team.id)
                                      ? "bg-black text-white border-black"
                                      : "bg-white text-black/40 border-black/10 hover:border-black/30"
                                  )}
                                >
                                  {team.name}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>

                        <WYSIWYGEditor 
                          content={editArticle.content || ''} 
                          onChange={(html) => setEditArticle({ ...editArticle, content: html })} 
                        />
                      </div>
                    </motion.div>
                  ) : selectedArticleId ? (
                    <motion.div 
                      key="viewer"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="p-10 max-w-4xl mx-auto"
                    >
                      <div className="flex items-center justify-between mb-12">
                        <div className="flex items-center gap-4 text-xs text-black/40">
                          <div className="flex items-center gap-1.5">
                            <Clock className="w-3.5 h-3.5" />
                            Updated {format(parseISO(editArticle.updated_at!), 'MMM d, yyyy')}
                          </div>
                          {editArticle.expires_at && (
                            <div className={cn(
                              "flex items-center gap-1.5 px-2 py-1 rounded-md",
                              isPast(parseISO(editArticle.expires_at)) ? "bg-amber-50 text-amber-700 font-medium" : ""
                            )}>
                              <AlertTriangle className="w-3.5 h-3.5" />
                              Expires {format(parseISO(editArticle.expires_at), 'MMM d, yyyy')}
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-4">
                          <button 
                            onClick={() => setIsEditing(true)}
                            className="flex items-center gap-2 text-sm font-medium hover:text-black/60 transition-colors"
                          >
                            <Edit3 className="w-4 h-4" />
                            Edit Article
                          </button>
                          <button 
                            onClick={() => handleDeleteArticle(editArticle.id!)}
                            className="flex items-center gap-2 text-sm font-medium text-red-500 hover:text-red-700 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                            Delete
                          </button>
                        </div>
                      </div>

                      <h1 className="text-5xl font-bold tracking-tight mb-4 leading-[1.1]">
                        {editArticle.title}
                      </h1>

                      {editArticle.tags && (
                        <div className="flex flex-wrap gap-2 mb-8">
                          {editArticle.tags.split(',').map(tag => (
                            <span key={tag} className="text-[10px] font-bold uppercase tracking-widest text-indigo-500 bg-indigo-50 px-2 py-1 rounded">
                              {tag.trim()}
                            </span>
                          ))}
                        </div>
                      )}

                      <div className="flex flex-wrap gap-2 mb-12">
                        {editArticle.team_access?.map(teamId => {
                          const team = teams.find(t => t.id === teamId);
                          return team ? (
                            <span key={team.id} className="bg-[#F5F5F5] text-black/60 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider">
                              {team.name}
                            </span>
                          ) : null;
                        })}
                      </div>

                      <div className="prose prose-slate max-w-none prose-headings:tracking-tight prose-a:text-black prose-img:rounded-2xl prose-table:border prose-table:rounded-xl prose-th:bg-[#F5F5F5] prose-th:px-4 prose-th:py-2 prose-td:px-4 prose-td:py-2 prose-blockquote:border-l-4 prose-blockquote:border-black/10 prose-blockquote:bg-[#F5F5F5]/50 prose-blockquote:py-1 prose-blockquote:px-6 prose-blockquote:rounded-r-xl">
                        <ReactMarkdown 
                          remarkPlugins={[remarkGfm]} 
                          rehypePlugins={[rehypeRaw]}
                          components={{
                            blockquote: ({ children }) => {
                              const content = React.Children.toArray(children).map(c => typeof c === 'string' ? c : (c as any).props?.children).join('');
                              if (content.includes('[!INFO]')) {
                                return (
                                  <div className="my-6 p-6 bg-blue-50 border-l-4 border-blue-500 rounded-r-2xl flex gap-4">
                                    <Info className="w-5 h-5 text-blue-500 shrink-0 mt-1" />
                                    <div className="text-blue-900 text-sm leading-relaxed">
                                      {React.Children.toArray(children).map(c => {
                                        if (typeof c === 'string') return c.replace('[!INFO]', '');
                                        return c;
                                      })}
                                    </div>
                                  </div>
                                );
                              }
                              return <blockquote className="border-l-4 border-black/10 bg-[#F5F5F5]/50 py-1 px-6 rounded-r-xl my-6 italic text-black/60">{children}</blockquote>;
                            },
                            code: ({ inline, className, children, ...props }: any) => {
                              if (inline) return <code className="bg-[#F5F5F5] px-1.5 py-0.5 rounded text-sm font-mono text-indigo-600" {...props}>{children}</code>;
                              return (
                                <pre className="bg-[#1A1A1A] text-white p-6 rounded-2xl overflow-x-auto my-6 font-mono text-sm leading-relaxed">
                                  <code {...props}>{children}</code>
                                </pre>
                              );
                            }
                          }}
                        >
                          {editArticle.content || ''}
                        </ReactMarkdown>
                      </div>
                    </motion.div>
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center text-center p-10">
                      <div className="w-20 h-20 bg-[#F5F5F5] rounded-3xl flex items-center justify-center mb-6">
                        <FileText className="w-10 h-10 text-black/10" />
                      </div>
                      <h3 className="text-xl font-semibold tracking-tight mb-2">Select an article</h3>
                      <p className="text-sm text-black/40 max-w-xs">
                        Navigate through folders to find the knowledge you need.
                      </p>
                    </div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          )}
        </div>

        {/* Announcement Modal */}
        <AnimatePresence>
          {isAnnouncing && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setIsAnnouncing(false)}
                className="absolute inset-0 bg-black/20 backdrop-blur-sm"
              />
              <motion.div 
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl overflow-hidden"
              >
                <div className="p-8 space-y-6">
                  <div className="flex justify-between items-center">
                    <h3 className="text-xl font-semibold tracking-tight">Send Announcement</h3>
                    <button onClick={() => setIsAnnouncing(false)} className="text-black/20 hover:text-black">
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                  
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold uppercase tracking-wider text-black/40">Target Group</label>
                      <select 
                        className="w-full bg-[#F5F5F5] border-none rounded-xl px-4 py-3 text-sm outline-none"
                        value={announcementTeamId || ''}
                        onChange={e => setAnnouncementTeamId(e.target.value ? parseInt(e.target.value) : null)}
                      >
                        <option value="">All Users</option>
                        {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                      </select>
                    </div>
                    
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold uppercase tracking-wider text-black/40">Message</label>
                      <textarea 
                        placeholder="e.g. Hi team, just to let you know that the eligibility criteria for refunds has changed..."
                        className="w-full h-32 bg-[#F5F5F5] border-none rounded-xl px-4 py-3 text-sm outline-none resize-none"
                        value={announcementMessage}
                        onChange={e => setAnnouncementMessage(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="flex gap-3 pt-2">
                    <button 
                      onClick={() => setIsAnnouncing(false)}
                      className="flex-1 px-6 py-3 rounded-xl text-sm font-medium border border-black/10 hover:bg-black/5 transition-colors"
                    >
                      Cancel
                    </button>
                    <button 
                      onClick={handleSendAnnouncement}
                      disabled={!announcementMessage}
                      className="flex-1 bg-black text-white px-6 py-3 rounded-xl text-sm font-medium hover:bg-black/80 transition-colors disabled:opacity-50"
                    >
                      Send Update
                    </button>
                  </div>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}

function ImportPreviewTree({ item, onChange }: { item: any, onChange: (updated: any) => void }) {
  const [isExpanded, setIsExpanded] = useState(true);

  if (!item) return null;

  const handleNameChange = (newName: string) => {
    onChange({ ...item, name: newName });
  };

  const handleChildChange = (index: number, updatedChild: any) => {
    const newChildren = [...(item.children || [])];
    newChildren[index] = updatedChild;
    onChange({ ...item, children: newChildren });
  };

  if (item.type === 'info') {
    return (
      <div className="flex items-center gap-2 py-2 px-3 text-black/40 italic text-sm">
        <Info className="w-4 h-4" />
        {item.name}
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-3 group py-1.5 px-3 rounded-xl hover:bg-black/5 transition-colors">
        {item.type === 'folder' ? (
          <button 
            onClick={() => setIsExpanded(!isExpanded)}
            className={cn("p-0.5 rounded hover:bg-black/10 transition-transform", isExpanded ? "rotate-90" : "")}
          >
            <ChevronRight className="w-3 h-3 text-black/40" />
          </button>
        ) : (
          <div className="w-4" />
        )}
        
        {item.type === 'folder' ? (
          <Folder className="w-4 h-4 text-black/40 shrink-0" />
        ) : (
          <FileText className="w-4 h-4 text-black/40 shrink-0" />
        )}

        <input 
          type="text"
          value={item.name}
          onChange={(e) => handleNameChange(e.target.value)}
          className="bg-transparent border-none outline-none text-sm font-medium flex-1 focus:ring-1 focus:ring-black/10 rounded px-1 -ml-1 transition-all"
        />
        
        <span className="text-[10px] uppercase font-bold text-black/20 opacity-0 group-hover:opacity-100 transition-opacity">
          {item.type}
        </span>
      </div>

      {item.type === 'folder' && isExpanded && item.children && (
        <div className="ml-6 border-l border-black/5 pl-2 space-y-1">
          {item.children.map((child: any, idx: number) => (
            <ImportPreviewTree 
              key={idx} 
              item={child} 
              onChange={(updated) => handleChildChange(idx, updated)} 
            />
          ))}
        </div>
      )}
    </div>
  );
}

// --- Sub-components ---

function WYSIWYGEditor({ content, onChange }: { content: string, onChange: (html: string) => void }) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      Link.configure({ openOnClick: false }),
      Image,
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      TaskList,
      TaskItem.configure({ nested: true }),
      Placeholder.configure({ placeholder: 'Write your article content here...' }),
    ],
    content: content,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
  });

  if (!editor) return null;

  const MenuButton = ({ onClick, isActive, icon: Icon, label }: any) => (
    <button
      onClick={(e) => { e.preventDefault(); onClick(); }}
      className={cn(
        "p-2 rounded-lg transition-all group relative",
        isActive ? "bg-black text-white" : "hover:bg-black/5 text-black/40 hover:text-black"
      )}
      title={label}
    >
      <Icon className="w-4 h-4" />
    </button>
  );

  return (
    <div className="border border-black/5 rounded-2xl overflow-hidden bg-white shadow-sm">
      <div className="flex flex-wrap gap-1 p-2 bg-[#F5F5F5] border-b border-black/5">
        <MenuButton 
          onClick={() => editor.chain().focus().toggleBold().run()} 
          isActive={editor.isActive('bold')} 
          icon={Type} 
          label="Bold" 
        />
        <MenuButton 
          onClick={() => editor.chain().focus().toggleItalic().run()} 
          isActive={editor.isActive('italic')} 
          icon={Type} 
          label="Italic" 
        />
        <MenuButton 
          onClick={() => editor.chain().focus().toggleUnderline().run()} 
          isActive={editor.isActive('underline')} 
          icon={Type} 
          label="Underline" 
        />
        <MenuButton 
          onClick={() => editor.chain().focus().toggleStrike().run()} 
          isActive={editor.isActive('strike')} 
          icon={Type} 
          label="Strike" 
        />
        <div className="w-px h-6 bg-black/5 mx-1 self-center" />
        <MenuButton 
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} 
          isActive={editor.isActive('heading', { level: 1 })} 
          icon={Type} 
          label="H1" 
        />
        <MenuButton 
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} 
          isActive={editor.isActive('heading', { level: 2 })} 
          icon={Type} 
          label="H2" 
        />
        <MenuButton 
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} 
          isActive={editor.isActive('heading', { level: 3 })} 
          icon={Type} 
          label="H3" 
        />
        <div className="w-px h-6 bg-black/5 mx-1 self-center" />
        <MenuButton 
          onClick={() => editor.chain().focus().toggleBulletList().run()} 
          isActive={editor.isActive('bulletList')} 
          icon={List} 
          label="Bullet List" 
        />
        <MenuButton 
          onClick={() => editor.chain().focus().toggleOrderedList().run()} 
          isActive={editor.isActive('orderedList')} 
          icon={List} 
          label="Ordered List" 
        />
        <MenuButton 
          onClick={() => editor.chain().focus().toggleTaskList().run()} 
          isActive={editor.isActive('taskList')} 
          icon={CheckSquare} 
          label="Task List" 
        />
        <div className="w-px h-6 bg-black/5 mx-1 self-center" />
        <MenuButton 
          onClick={() => editor.chain().focus().toggleBlockquote().run()} 
          isActive={editor.isActive('blockquote')} 
          icon={Quote} 
          label="Blockquote" 
        />
        <MenuButton 
          onClick={() => editor.chain().focus().toggleCodeBlock().run()} 
          isActive={editor.isActive('codeBlock')} 
          icon={Code} 
          label="Code Block" 
        />
        <div className="w-px h-6 bg-black/5 mx-1 self-center" />
        <MenuButton 
          onClick={() => {
            const url = window.prompt('Enter image URL');
            if (url) editor.chain().focus().setImage({ src: url }).run();
          }} 
          isActive={false} 
          icon={ImageIcon} 
          label="Image" 
        />
        <MenuButton 
          onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()} 
          isActive={false} 
          icon={TableIcon} 
          label="Table" 
        />
        <div className="w-px h-6 bg-black/5 mx-1 self-center" />
        <MenuButton 
          onClick={() => editor.chain().focus().undo().run()} 
          isActive={false} 
          icon={ChevronLeft} 
          label="Undo" 
        />
        <MenuButton 
          onClick={() => editor.chain().focus().redo().run()} 
          isActive={false} 
          icon={ChevronRight} 
          label="Redo" 
        />
      </div>
      <EditorContent editor={editor} className="prose prose-slate max-w-none p-8 min-h-[500px] focus:outline-none" />
    </div>
  );
}

function AdminPanel({ 
  users, 
  teams, 
  folders, 
  articles,
  folderAccess, 
  onUpdateUsers, 
  onUpdateTeams, 
  onUpdateFolderAccess,
  onUpdateArticles
}: { 
  users: User[], 
  teams: Team[], 
  folders: FolderType[], 
  articles: Article[],
  folderAccess: FolderAccess[],
  onUpdateUsers: (users: User[]) => void,
  onUpdateTeams: (teams: Team[]) => void,
  onUpdateFolderAccess: (access: FolderAccess[]) => void,
  onUpdateArticles: (articles: Article[]) => void
}) {
  const [activeTab, setActiveTab] = useState<'users' | 'groups' | 'folders' | 'articles'>('users');
  const [isAddingUser, setIsAddingUser] = useState(false);
  const [isAddingTeam, setIsAddingTeam] = useState(false);
  const [newUser, setNewUser] = useState<Partial<User>>({ role: 'viewer' });
  const [newTeamName, setNewTeamName] = useState('');
  const [selectedArticleIds, setSelectedArticleIds] = useState<number[]>([]);
  const [articleSearch, setArticleSearch] = useState('');

  const getFolderHierarchy = (folderId: number | null) => {
    if (!folderId) return { top: 'None', sub: 'None' };
    const folder = folders.find(f => f.id === folderId);
    if (!folder) return { top: 'None', sub: 'None' };
    
    if (folder.parent_id === null) {
      return { top: folder.name, sub: 'None' };
    } else {
      const parent = folders.find(f => f.id === folder.parent_id);
      return { top: parent?.name || 'Unknown', sub: folder.name };
    }
  };

  const handleBatchUpdate = async (updates: any) => {
    if (selectedArticleIds.length === 0) return;
    try {
      const res = await fetch('/api/admin/articles/batch-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ articleIds: selectedArticleIds, updates })
      });
      if (res.ok) {
        const resArticles = await fetch('/api/articles');
        if (resArticles.ok) {
          const data = await resArticles.json();
          onUpdateArticles(data);
          setSelectedArticleIds([]);
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleAddUser = async () => {
    if (!newUser.name || !newUser.email) return;
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newUser)
      });
      if (res.ok) {
        const { id } = await res.json();
        const team = teams.find(t => t.id === newUser.team_id);
        onUpdateUsers([...users, { ...newUser, id, team_name: team?.name } as User]);
        setIsAddingUser(false);
        setNewUser({ role: 'viewer' });
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteUser = async (id: number) => {
    if (!confirm('Delete this user?')) return;
    try {
      const res = await fetch(`/api/admin/users/${id}`, { method: 'DELETE' });
      if (res.ok) {
        onUpdateUsers(users.filter(u => u.id !== id));
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleAddTeam = async () => {
    if (!newTeamName) return;
    try {
      const res = await fetch('/api/admin/teams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newTeamName })
      });
      if (res.ok) {
        const team = await res.json();
        onUpdateTeams([...teams, team]);
        setIsAddingTeam(false);
        setNewTeamName('');
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteTeam = async (id: number) => {
    if (!confirm('Delete this group?')) return;
    try {
      const res = await fetch(`/api/admin/teams/${id}`, { method: 'DELETE' });
      if (res.ok) {
        onUpdateTeams(teams.filter(t => t.id !== id));
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleToggleFolderAccess = async (folderId: number, teamId: number) => {
    const hasAccess = folderAccess.some(a => a.folder_id === folderId && a.team_id === teamId);
    const method = hasAccess ? 'DELETE' : 'POST';
    try {
      const res = await fetch('/api/admin/folder-access', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folder_id: folderId, team_id: teamId })
      });
      if (res.ok) {
        if (hasAccess) {
          onUpdateFolderAccess(folderAccess.filter(a => !(a.folder_id === folderId && a.team_id === teamId)));
        } else {
          onUpdateFolderAccess([...folderAccess, { folder_id: folderId, team_id: teamId }]);
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="flex-1 flex flex-col bg-[#FAFAFA] overflow-hidden">
      <div className="flex border-b border-black/5 bg-white px-8">
        {[
          { id: 'users', label: 'Users', icon: Users },
          { id: 'groups', label: 'Groups', icon: Shield },
          { id: 'folders', label: 'Folder Permissions', icon: Lock },
          { id: 'articles', label: 'Article Manager', icon: FileText }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={cn(
              "flex items-center gap-2 px-6 py-4 text-sm font-medium border-b-2 transition-all",
              activeTab === tab.id ? "border-black text-black" : "border-transparent text-black/40 hover:text-black"
            )}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-8">
        <div className="max-w-5xl mx-auto">
          {activeTab === 'users' && (
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-semibold">User Management</h3>
                <button 
                  onClick={() => setIsAddingUser(true)}
                  className="bg-black text-white px-4 py-2 rounded-xl text-sm font-medium flex items-center gap-2"
                >
                  <UserPlus className="w-4 h-4" />
                  Add User
                </button>
              </div>

              {isAddingUser && (
                <div className="bg-white p-6 rounded-2xl border border-black/5 shadow-sm space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <input 
                      placeholder="Full Name"
                      className="bg-[#F5F5F5] border-none rounded-xl px-4 py-2 text-sm outline-none"
                      value={newUser.name || ''}
                      onChange={e => setNewUser({...newUser, name: e.target.value})}
                    />
                    <input 
                      placeholder="Email Address"
                      className="bg-[#F5F5F5] border-none rounded-xl px-4 py-2 text-sm outline-none"
                      value={newUser.email || ''}
                      onChange={e => setNewUser({...newUser, email: e.target.value})}
                    />
                    <select 
                      className="bg-[#F5F5F5] border-none rounded-xl px-4 py-2 text-sm outline-none"
                      value={newUser.team_id || ''}
                      onChange={e => setNewUser({...newUser, team_id: parseInt(e.target.value)})}
                    >
                      <option value="">Select Group</option>
                      {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                    <select 
                      className="bg-[#F5F5F5] border-none rounded-xl px-4 py-2 text-sm outline-none"
                      value={newUser.role}
                      onChange={e => setNewUser({...newUser, role: e.target.value as any})}
                    >
                      <option value="viewer">Viewer</option>
                      <option value="editor">Editor</option>
                      <option value="admin">Admin</option>
                    </select>
                  </div>
                  <div className="flex justify-end gap-2">
                    <button onClick={() => setIsAddingUser(false)} className="px-4 py-2 text-sm font-medium text-black/40">Cancel</button>
                    <button onClick={handleAddUser} className="bg-black text-white px-4 py-2 rounded-xl text-sm font-medium">Create User</button>
                  </div>
                </div>
              )}

              <div className="bg-white rounded-2xl border border-black/5 shadow-sm overflow-hidden">
                <table className="w-full text-left text-sm">
                  <thead className="bg-[#F5F5F5] text-black/40 font-bold uppercase text-[10px] tracking-wider">
                    <tr>
                      <th className="px-6 py-4">Name</th>
                      <th className="px-6 py-4">Email</th>
                      <th className="px-6 py-4">Group</th>
                      <th className="px-6 py-4">Role</th>
                      <th className="px-6 py-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-black/5">
                    {users.map(user => (
                      <tr key={user.id} className="hover:bg-black/[0.01]">
                        <td className="px-6 py-4 font-medium">{user.name}</td>
                        <td className="px-6 py-4 text-black/60">{user.email}</td>
                        <td className="px-6 py-4">
                          <span className="bg-[#F5F5F5] px-2 py-1 rounded text-[10px] font-bold uppercase">
                            {user.team_name || 'No Group'}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span className={cn(
                            "px-2 py-1 rounded text-[10px] font-bold uppercase",
                            user.role === 'admin' ? "bg-purple-50 text-purple-600" :
                            user.role === 'editor' ? "bg-blue-50 text-blue-600" : "bg-gray-50 text-gray-600"
                          )}>
                            {user.role}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <button onClick={() => handleDeleteUser(user.id)} className="text-red-400 hover:text-red-600">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'groups' && (
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-semibold">Group Management</h3>
                <button 
                  onClick={() => setIsAddingTeam(true)}
                  className="bg-black text-white px-4 py-2 rounded-xl text-sm font-medium flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  New Group
                </button>
              </div>

              {isAddingTeam && (
                <div className="bg-white p-6 rounded-2xl border border-black/5 shadow-sm flex gap-4">
                  <input 
                    placeholder="Group Name (e.g. Line 1)"
                    className="flex-1 bg-[#F5F5F5] border-none rounded-xl px-4 py-2 text-sm outline-none"
                    value={newTeamName}
                    onChange={e => setNewTeamName(e.target.value)}
                  />
                  <button onClick={() => setIsAddingTeam(false)} className="px-4 py-2 text-sm font-medium text-black/40">Cancel</button>
                  <button onClick={handleAddTeam} className="bg-black text-white px-4 py-2 rounded-xl text-sm font-medium">Create Group</button>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                {teams.map(team => (
                  <div key={team.id} className="bg-white p-6 rounded-2xl border border-black/5 shadow-sm flex items-center justify-between">
                    <div>
                      <h4 className="font-semibold">{team.name}</h4>
                      <p className="text-xs text-black/40">
                        {users.filter(u => u.team_id === team.id).length} members
                      </p>
                    </div>
                    <button onClick={() => handleDeleteTeam(team.id)} className="text-red-400 hover:text-red-600">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'folders' && (
            <div className="space-y-6">
              <h3 className="text-lg font-semibold">Folder Access Control</h3>
              <div className="bg-white rounded-2xl border border-black/5 shadow-sm overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-[#F5F5F5] text-black/40 font-bold uppercase text-[10px] tracking-wider">
                    <tr>
                      <th className="px-6 py-4 sticky left-0 bg-[#F5F5F5]">Folder</th>
                      {teams.map(team => (
                        <th key={team.id} className="px-6 py-4 text-center">{team.name}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-black/5">
                    {folders.map(folder => (
                      <tr key={folder.id} className="hover:bg-black/[0.01]">
                        <td className="px-6 py-4 font-medium sticky left-0 bg-white">
                          <div className="flex items-center gap-2">
                            <Folder className="w-4 h-4 text-black/20" />
                            {folder.name}
                          </div>
                        </td>
                        {teams.map(team => {
                          const hasAccess = folderAccess.some(a => a.folder_id === folder.id && a.team_id === team.id);
                          return (
                            <td key={team.id} className="px-6 py-4 text-center">
                              <button 
                                onClick={() => handleToggleFolderAccess(folder.id, team.id)}
                                className={cn(
                                  "p-2 rounded-lg transition-all",
                                  hasAccess ? "bg-emerald-50 text-emerald-600" : "bg-gray-50 text-gray-300 hover:text-black/20"
                                )}
                              >
                                {hasAccess ? <CheckSquare className="w-5 h-5" /> : <Square className="w-5 h-5" />}
                              </button>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'articles' && (
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-semibold">Article Manager</h3>
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-black/20" />
                  <input 
                    placeholder="Search articles..."
                    className="bg-white border border-black/5 rounded-xl pl-10 pr-4 py-2 text-sm outline-none w-64 shadow-sm"
                    value={articleSearch}
                    onChange={e => setArticleSearch(e.target.value)}
                  />
                </div>
              </div>

              {selectedArticleIds.length > 0 && (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-black text-white p-4 rounded-2xl flex items-center justify-between shadow-lg"
                >
                  <div className="flex items-center gap-6">
                    <div className="flex items-center gap-2">
                      <CheckSquare className="w-4 h-4 text-emerald-400" />
                      <span className="text-sm font-bold">{selectedArticleIds.length} articles selected</span>
                    </div>
                    <div className="w-px h-4 bg-white/20" />
                    <div className="flex items-center gap-3">
                      <span className="text-[10px] uppercase font-bold text-white/40">Move to:</span>
                      <select 
                        className="bg-white/10 border-none rounded-lg px-3 py-1.5 text-xs outline-none hover:bg-white/20 transition-colors"
                        onChange={(e) => e.target.value && handleBatchUpdate({ folder_id: parseInt(e.target.value) })}
                        value=""
                      >
                        <option value="" className="text-black">Select Folder</option>
                        {folders.map(f => (
                          <option key={f.id} value={f.id} className="text-black">
                            {f.parent_id ? '  ↳ ' : ''}{f.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="w-px h-4 bg-white/20" />
                    <button 
                      onClick={() => handleBatchUpdate({ expires_at: null })}
                      className="text-xs font-bold hover:text-emerald-400 transition-colors flex items-center gap-2"
                    >
                      <Clock className="w-3.5 h-3.5" />
                      Set as Current
                    </button>
                  </div>
                  <button onClick={() => setSelectedArticleIds([])} className="text-white/40 hover:text-white p-1">
                    <X className="w-4 h-4" />
                  </button>
                </motion.div>
              )}

              <div className="bg-white rounded-2xl border border-black/5 shadow-sm overflow-hidden">
                <table className="w-full text-left text-sm">
                  <thead className="bg-[#F5F5F5] text-black/40 font-bold uppercase text-[10px] tracking-wider">
                    <tr>
                      <th className="px-6 py-4 w-10">
                        <button 
                          onClick={() => {
                            if (selectedArticleIds.length === articles.length) setSelectedArticleIds([]);
                            else setSelectedArticleIds(articles.map(a => a.id));
                          }}
                          className="text-black/20 hover:text-black"
                        >
                          {selectedArticleIds.length === articles.length ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                        </button>
                      </th>
                      <th className="px-6 py-4">Article Name</th>
                      <th className="px-6 py-4">Top Folder</th>
                      <th className="px-6 py-4">Sub Folder</th>
                      <th className="px-6 py-4">Last Update</th>
                      <th className="px-6 py-4">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-black/5">
                    {articles
                      .filter(a => a.title.toLowerCase().includes(articleSearch.toLowerCase()))
                      .map(article => {
                        const { top, sub } = getFolderHierarchy(article.folder_id);
                        const isExpired = article.expires_at && isPast(parseISO(article.expires_at));
                        const isSelected = selectedArticleIds.includes(article.id);
                        
                        return (
                          <tr key={article.id} className={cn("hover:bg-black/[0.01] transition-colors", isSelected && "bg-black/[0.02]")}>
                            <td className="px-6 py-4">
                              <button 
                                onClick={() => {
                                  if (isSelected) setSelectedArticleIds(selectedArticleIds.filter(id => id !== article.id));
                                  else setSelectedArticleIds([...selectedArticleIds, article.id]);
                                }}
                                className={cn("transition-colors", isSelected ? "text-black" : "text-black/10 hover:text-black/20")}
                              >
                                {isSelected ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                              </button>
                            </td>
                            <td className="px-6 py-4 font-medium">{article.title}</td>
                            <td className="px-6 py-4">
                              <span className="bg-gray-50 px-2 py-1 rounded text-[10px] font-bold uppercase text-black/60">
                                {top}
                              </span>
                            </td>
                            <td className="px-6 py-4">
                              <span className="bg-gray-50 px-2 py-1 rounded text-[10px] font-bold uppercase text-black/60">
                                {sub}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-black/40 text-xs">
                              {format(parseISO(article.updated_at), 'MMM d, yyyy')}
                            </td>
                            <td className="px-6 py-4">
                              <span className={cn(
                                "px-2 py-1 rounded text-[10px] font-bold uppercase",
                                isExpired ? "bg-red-50 text-red-600" : "bg-emerald-50 text-emerald-600"
                              )}>
                                {isExpired ? 'Expired' : 'Current'}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// --- Sub-components ---

function FolderTree({ 
  folders, 
  selectedId, 
  onSelect, 
  onDrop,
  expandedIds,
  onToggleExpand,
  editingId,
  onRename,
  onStartRename,
  onDelete,
  editValue,
  onEditChange,
  parentId = null, 
  level = 0 
}: { 
  folders: FolderType[], 
  selectedId: number | null, 
  onSelect: (id: number | null) => void,
  onDrop: (e: React.DragEvent, folderId: number | null) => void,
  expandedIds: number[],
  onToggleExpand: (e: React.MouseEvent, id: number) => void,
  editingId: number | null,
  onRename: (id: number) => void,
  onStartRename: (id: number, name: string) => void,
  onDelete: (id: number) => void,
  editValue: string,
  onEditChange: (val: string) => void,
  parentId?: number | null,
  level?: number
}) {
  const currentFolders = folders.filter(f => f.parent_id === parentId);
  
  if (currentFolders.length === 0 && level > 0) return null;

  return (
    <div className="space-y-0.5">
      {currentFolders.map(folder => {
        const hasChildren = folders.some(f => f.parent_id === folder.id);
        const isExpanded = expandedIds.includes(folder.id);

        return (
          <div key={folder.id}>
            <div
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData('type', 'folder');
                e.dataTransfer.setData('folderId', folder.id.toString());
              }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => onDrop(e, folder.id)}
              className={cn(
                "w-full flex items-center justify-between group px-3 py-2 rounded-xl text-sm font-medium transition-colors cursor-pointer",
                selectedId === folder.id ? "bg-black text-white" : "hover:bg-black/5"
              )}
              style={{ paddingLeft: `${(level + 1) * 12}px` }}
              onClick={() => onSelect(folder.id)}
            >
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <div className="flex items-center gap-1">
                  {hasChildren ? (
                    <button 
                      onClick={(e) => onToggleExpand(e, folder.id)}
                      className={cn(
                        "p-0.5 rounded hover:bg-black/10 transition-transform",
                        isExpanded ? "rotate-90" : ""
                      )}
                    >
                      <ChevronRight className={cn("w-3 h-3", selectedId === folder.id ? "text-white" : "text-black/40")} />
                    </button>
                  ) : (
                    <div className="w-4" />
                  )}
                  <Folder className={cn("w-4 h-4 shrink-0", selectedId === folder.id ? "text-white" : "text-black/40")} />
                </div>
                {editingId === folder.id ? (
                  <input 
                    autoFocus
                    className="bg-transparent border-b border-white/20 outline-none w-full"
                    value={editValue}
                    onChange={(e) => onEditChange(e.target.value)}
                    onBlur={() => onRename(folder.id)}
                    onKeyDown={(e) => e.key === 'Enter' && onRename(folder.id)}
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <span className="truncate">{folder.name}</span>
                )}
              </div>
              {!editingId && (
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-all">
                  <button 
                    onClick={(e) => { e.stopPropagation(); onStartRename(folder.id, folder.name); }}
                    className="p-1 hover:bg-white/10 rounded transition-all"
                  >
                    <Edit3 className="w-3 h-3" />
                  </button>
                  <button 
                    onClick={(e) => { e.stopPropagation(); onDelete(folder.id); }}
                    className="p-1 hover:bg-red-500/20 text-red-400 hover:text-red-500 rounded transition-all"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              )}
            </div>
            {isExpanded && (
              <FolderTree 
                folders={folders} 
                selectedId={selectedId} 
                onSelect={onSelect} 
                onDrop={onDrop}
                expandedIds={expandedIds}
                onToggleExpand={onToggleExpand}
                editingId={editingId}
                onRename={onRename}
                onStartRename={onStartRename}
                onDelete={onDelete}
                editValue={editValue}
                onEditChange={onEditChange}
                parentId={folder.id} 
                level={level + 1} 
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
