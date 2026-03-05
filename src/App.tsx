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
  Type as LucideType,
  List,
  Quote,
  Code,
  Table as TableIcon,
  Image as ImageIcon,
  ChevronDownSquare,
  Info,
  Smile,
  GripHorizontal,
  Brain,
  Calendar,
  Sparkles,
  Send,
  CheckCircle2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import { format, isPast, parseISO, subDays } from 'date-fns';
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
import { GoogleGenAI, Type } from "@google/genai";
import {
  DndContext,
  DragOverlay,
  useDraggable,
  useDroppable,
  PointerSensor,
  useSensor,
  useSensors,
  DragStartEvent,
  DragEndEvent,
} from '@dnd-kit/core';

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

interface QuizQuestion {
  id?: number;
  question: string;
  options: string[];
  correct_option_index: number;
  feedback?: string;
  article_id?: number | null;
}

interface Quiz {
  id: number;
  title: string;
  description: string;
  team_id: number | null;
  created_at: string;
  expires_at: string | null;
  created_by: number;
  status: 'draft' | 'published';
  team_name?: string;
  questions?: QuizQuestion[];
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

// --- DnD Components ---

function DraggableArticle({ article, children }: { article: Article, children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `article-${article.id}`,
    data: { type: 'article', id: article.id }
  });

  const style = transform ? {
    transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
  } : undefined;

  return (
    <div ref={setNodeRef} style={style} {...listeners} {...attributes} className={cn(isDragging && "opacity-50")}>
      {children}
    </div>
  );
}

function DroppableFolder({ id, children, className }: { id: number | null, children: React.ReactNode, className?: string }) {
  const { isOver, setNodeRef } = useDroppable({
    id: `folder-${id ?? 'root'}`,
    data: { type: 'folder', id }
  });

  return (
    <div 
      ref={setNodeRef} 
      className={cn(
        className,
        isOver && "ring-2 ring-indigo-500 ring-inset rounded-xl bg-indigo-50/50"
      )}
    >
      {children}
    </div>
  );
}

function FolderTreeItem({ 
  folder, 
  folders, 
  selectedFolderId, 
  expandedFolderIds, 
  editingFolderId, 
  editFolderName, 
  setEditFolderName,
  onFolderClick, 
  onToggleExpansion, 
  onRename, 
  onDelete,
  setEditingFolderId,
  isCreatingFolder,
  setIsCreatingFolder,
  newFolderName,
  setNewFolderName,
  onCreateFolder,
  editArticle,
  setEditArticle
}: any) {
  const subfolders = folders.filter((f: any) => f.parent_id === folder.id);
  const isExpanded = expandedFolderIds.includes(folder.id);
  const isSelected = selectedFolderId === folder.id;

  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `folder-drag-${folder.id}`,
    data: { type: 'folder', id: folder.id }
  });

  const style = transform ? {
    transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
  } : undefined;

  return (
    <div className="space-y-1">
      <DroppableFolder id={folder.id}>
        <div 
          ref={setNodeRef} 
          style={style} 
          className={cn("group relative", isDragging && "opacity-50")}
        >
          <div
            onClick={() => onFolderClick(folder.id)}
            className={cn(
              "w-full flex items-center justify-between px-3 py-2 rounded-xl text-sm font-medium transition-all cursor-pointer",
              isSelected ? "bg-black text-white shadow-md" : "hover:bg-black/5 text-black/70"
            )}
          >
            <div className="flex items-center gap-2 overflow-hidden">
              <div 
                onClick={(e) => onToggleExpansion(e, folder.id)}
                className="p-0.5 hover:bg-white/10 rounded transition-colors"
              >
                {subfolders.length > 0 ? (
                  isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />
                ) : (
                  <div className="w-3" />
                )}
              </div>
              <div {...listeners} {...attributes} className="cursor-grab active:cursor-grabbing">
                <Folder className={cn("w-4 h-4 shrink-0", isSelected ? "text-white" : "text-black/20")} />
              </div>
              {editingFolderId === folder.id ? (
                <input 
                  autoFocus
                  className="bg-transparent border-none outline-none text-white w-full"
                  value={editFolderName}
                  onChange={(e) => setEditFolderName(e.target.value)}
                  onBlur={() => onRename(folder.id)}
                  onKeyDown={(e) => e.key === 'Enter' && onRename(folder.id)}
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <span className="truncate">{folder.name}</span>
              )}
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <div className={cn(
                "flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity",
                isSelected ? "text-white/60" : "text-black/20"
              )}>
                <Plus className="w-3 h-3 hover:text-white cursor-pointer" onClick={(e) => { 
                  e.stopPropagation(); 
                  setIsCreatingFolder(true); 
                  setEditArticle({ ...editArticle, folder_id: folder.id });
                  if (!isExpanded) onToggleExpansion(e, folder.id);
                }} />
                <Edit3 className="w-3 h-3 hover:text-white cursor-pointer" onClick={(e) => { e.stopPropagation(); setEditingFolderId(folder.id); setEditFolderName(folder.name); }} />
                <Trash2 className="w-3 h-3 hover:text-red-400 cursor-pointer" onClick={(e) => { e.stopPropagation(); onDelete(folder.id); }} />
              </div>
            </div>
          </div>
        </div>
      </DroppableFolder>

      {isExpanded && (
        <div className="pl-4 space-y-1">
          {isCreatingFolder && editArticle.folder_id === folder.id && (
            <div className="px-3 py-2 space-y-2 bg-black/5 rounded-xl">
              <input 
                autoFocus
                type="text" 
                placeholder="Subfolder name..."
                className="w-full text-sm bg-transparent border-b border-black/10 outline-none py-1"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && onCreateFolder()}
              />
              <div className="flex gap-2">
                <button onClick={onCreateFolder} className="text-[10px] font-bold uppercase text-emerald-600">Save</button>
                <button onClick={() => setIsCreatingFolder(false)} className="text-[10px] font-bold uppercase text-red-600">Cancel</button>
              </div>
            </div>
          )}
          {subfolders.map((sub: any) => (
            <FolderTreeItem 
              key={sub.id}
              folder={sub}
              folders={folders}
              selectedFolderId={selectedFolderId}
              expandedFolderIds={expandedFolderIds}
              editingFolderId={editingFolderId}
              editFolderName={editFolderName}
              setEditFolderName={setEditFolderName}
              onFolderClick={onFolderClick}
              onToggleExpansion={onToggleExpansion}
              onRename={onRename}
              onDelete={onDelete}
              setEditingFolderId={setEditingFolderId}
              isCreatingFolder={isCreatingFolder}
              setIsCreatingFolder={setIsCreatingFolder}
              newFolderName={newFolderName}
              setNewFolderName={setNewFolderName}
              onCreateFolder={onCreateFolder}
              editArticle={editArticle}
              setEditArticle={setEditArticle}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// --- Components ---

export default function App() {
  const [folders, setFolders] = useState<FolderType[]>([]);
  const [articles, setArticles] = useState<Article[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<number | null>(null);
  const [selectedTopFolderId, setSelectedTopFolderId] = useState<number | null>(null);
  const [selectedSubFolderId, setSelectedSubFolderId] = useState<number | null>(null);
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
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [showAnnouncements, setShowAnnouncements] = useState(false);
  const [showQuizzes, setShowQuizzes] = useState(false);
  const [selectedQuizId, setSelectedQuizId] = useState<number | null>(null);
  const [isAnnouncing, setIsAnnouncing] = useState(false);
  const [announcementMessage, setAnnouncementMessage] = useState('');
  const [announcementTeamId, setAnnouncementTeamId] = useState<number | null>(null);

  // Fetch initial data
  useEffect(() => {
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
      setQuizzes(data.quizzes || []);
      
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
    
    if (id === null) {
      setSelectedTopFolderId(null);
      setSelectedSubFolderId(null);
    } else {
      const folder = folders.find(f => f.id === id);
      if (folder) {
        if (folder.parent_id === null) {
          setSelectedTopFolderId(id);
          setSelectedSubFolderId(null);
        } else {
          setSelectedTopFolderId(folder.parent_id);
          setSelectedSubFolderId(id);
        }
      }
    }

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
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const MAX_SIZE = 30 * 1024 * 1024; // 30MB
    const oversizedFiles = Array.from(files).filter(f => f.size > MAX_SIZE);
    if (oversizedFiles.length > 0) {
      alert(`Some files are too large (max 30MB): ${oversizedFiles.map(f => f.name).join(', ')}`);
      e.target.value = '';
      return;
    }

    const formData = new FormData();
    Array.from(files).forEach(file => {
      formData.append('files', file);
    });
    
    if (selectedFolderId) formData.append('folder_id', selectedFolderId.toString());

    setIsImporting(true);
    try {
      const res = await fetch('/api/import', {
        method: 'POST',
        headers: { 'Accept': 'application/json' },
        body: formData,
      });

      const contentType = res.headers.get("content-type");
      if (res.ok) {
        if (contentType && contentType.includes("application/json")) {
          const data = await res.json();
          fetchArticles(selectedFolderId, '', true);
          if (data.results && data.results.length > 0) {
            const successCount = data.results.filter((r: any) => r.success).length;
            const failCount = data.results.length - successCount;
            
            if (failCount > 0) {
              alert(`Imported ${successCount} files. ${failCount} files failed.`);
            }
            
            const firstSuccess = data.results.find((r: any) => r.success);
            if (firstSuccess) {
              handleArticleClick(firstSuccess.id);
            }
          }
        } else {
          const text = await res.text();
          console.error("Expected JSON but got:", text.slice(0, 200));
          alert(`Import failed: Server returned ${res.status} ${res.statusText} with non-JSON content. Check console for details.`);
        }
      } else {
        const errorText = await res.text();
        let errorMessage = "Failed to import files.";
        
        if (res.status === 413) {
          errorMessage = "The uploaded file is too large. Please try a smaller file (max 30MB).";
        } else if (contentType && contentType.includes("application/json")) {
          try {
            const errorData = JSON.parse(errorText);
            errorMessage = errorData.error || errorMessage;
          } catch (e) {
            // fallback
          }
        }
        
        console.error("Error response body:", errorText.slice(0, 500));
        alert(errorMessage);
      }
    } catch (error) {
      console.error('Import error:', error);
    } finally {
      setIsImporting(false);
      e.target.value = ''; // Reset input
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

  const [activeDragItem, setActiveDragItem] = useState<{ type: 'article' | 'folder', id: number } | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    setActiveDragItem(active.data.current as any);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveDragItem(null);

    if (!over) return;

    const activeData = active.data.current as { type: 'article' | 'folder', id: number };
    const overData = over.data.current as { type: 'folder', id: number | null };

    if (!activeData || !overData) return;

    if (activeData.type === 'article') {
      // Move article to folder
      if (activeData.id && overData.id !== undefined) {
        try {
          await fetch('/api/articles/batch-move', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ article_ids: [activeData.id], folder_id: overData.id })
          });
          fetchArticles(selectedFolderId, '', true);
        } catch (error) {
          console.error('Error moving article:', error);
        }
      }
    } else if (activeData.type === 'folder') {
      // Move folder to folder
      if (activeData.id !== overData.id) {
        handleMoveFolder(activeData.id, overData.id);
      }
    }
  };

  const expiredArticles = useMemo(() => {
    return articles.filter(a => a.expires_at && isPast(parseISO(a.expires_at)));
  }, [articles]);

  return (
    <DndContext 
      sensors={sensors} 
      onDragStart={handleDragStart} 
      onDragEnd={handleDragEnd}
    >
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
            onClick={() => { setShowAnnouncements(!showAnnouncements); setShowAdmin(false); setShowExpirationAlerts(false); setShowQuizzes(false); }}
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
            onClick={() => { setShowAnnouncements(false); setShowAdmin(false); setShowExpirationAlerts(false); setShowQuizzes(!showQuizzes); }}
            className={cn(
              "p-3 rounded-2xl transition-all group relative",
              showQuizzes ? "bg-black text-white shadow-lg" : "hover:bg-black/5 text-black/40 hover:text-black"
            )}
            title="Quizzes"
          >
            <Brain className="w-5 h-5" />
            <span className="absolute left-full ml-4 px-2 py-1 bg-black text-white text-[10px] rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-50">Quizzes</span>
          </button>

          <button 
            onClick={() => { setShowAdmin(!showAdmin); setShowAnnouncements(false); setShowExpirationAlerts(false); setShowQuizzes(false); }}
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
            onClick={() => { setShowExpirationAlerts(!showExpirationAlerts); setShowQuizzes(false); }}
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

        <div className="mt-auto flex flex-col gap-4">
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

        {/* Content Area */}
        <div className="flex-1 flex overflow-hidden">
          {showAdmin ? (
            <AdminPanel 
              users={users} 
              teams={teams} 
              folders={folders} 
              articles={articles}
              folderAccess={folderAccess} 
              quizzes={quizzes}
              onUpdateUsers={(newUsers) => setUsers(newUsers)}
              onUpdateTeams={(newTeams) => setTeams(newTeams)}
              onUpdateFolderAccess={(newAccess) => setFolderAccess(newAccess)}
              onUpdateArticles={(newArticles) => setArticles(newArticles)}
              onUpdateQuizzes={(newQuizzes) => setQuizzes(newQuizzes)}
              currentUser={currentUser}
            />
          ) : showQuizzes ? (
            selectedQuizId ? (
              <QuizPlayer 
                quiz={quizzes.find(q => q.id === selectedQuizId)!} 
                onClose={() => setSelectedQuizId(null)} 
                onViewArticle={(id) => {
                  setSelectedArticleId(id);
                  setShowQuizzes(false);
                  setSelectedQuizId(null);
                }}
              />
            ) : (
              <div className="flex-1 overflow-y-auto bg-[#FAFAFA] p-8">
                <div className="max-w-5xl mx-auto space-y-8">
                  <div className="space-y-1">
                    <h3 className="text-3xl font-bold">Knowledge Quizzes</h3>
                    <p className="text-black/40">Test your knowledge on recent updates and company policies.</p>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-6">
                    {quizzes.filter(q => q.status === 'published' && (q.team_id === null || q.team_id === currentUser?.team_id)).map(quiz => (
                      <button 
                        key={quiz.id}
                        onClick={async () => {
                          const res = await fetch(`/api/quizzes/${quiz.id}`);
                          if (res.ok) {
                            const fullQuiz = await res.json();
                            setQuizzes(quizzes.map(q => q.id === quiz.id ? fullQuiz : q));
                            setSelectedQuizId(quiz.id);
                          }
                        }}
                        className="bg-white p-8 rounded-[32px] border border-black/5 shadow-sm hover:shadow-xl hover:shadow-black/[0.02] hover:border-black/10 transition-all text-left flex flex-col justify-between group"
                      >
                        <div className="space-y-4">
                          <div className="w-12 h-12 bg-indigo-50 text-indigo-500 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform">
                            <Brain className="w-6 h-6" />
                          </div>
                          <div className="space-y-2">
                            <h4 className="text-xl font-bold">{quiz.title}</h4>
                            <p className="text-sm text-black/40 line-clamp-2">{quiz.description}</p>
                          </div>
                        </div>
                        <div className="mt-8 pt-6 border-t border-black/5 flex items-center justify-between">
                          <div className="flex items-center gap-3 text-[10px] font-bold uppercase tracking-wider text-black/20">
                            <span className="flex items-center gap-1">
                              <List className="w-3 h-3" />
                              5 Questions
                            </span>
                            {quiz.expires_at && (
                              <span className="flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                Due {format(parseISO(quiz.expires_at), 'MMM d')}
                              </span>
                            )}
                          </div>
                          <div className="w-8 h-8 rounded-full bg-black text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all -translate-x-2 group-hover:translate-x-0">
                            <ChevronRight className="w-4 h-4" />
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )
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
                      {a.message.includes('New Quiz Available:') && (
                        <button 
                          onClick={() => {
                            setShowQuizzes(true);
                            setShowAnnouncements(false);
                          }}
                          className="flex items-center gap-2 text-xs font-bold text-indigo-500 hover:text-indigo-600 transition-colors"
                        >
                          <Brain className="w-3.5 h-3.5" />
                          Go to Quizzes
                        </button>
                      )}
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
              {/* Column 1: Folder Tree */}
              <div className="w-64 border-r border-black/5 flex flex-col bg-white shrink-0">
                <div className="p-4 border-b border-black/5 flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-black/40">Knowledge Base</span>
                  <button onClick={() => { setIsCreatingFolder(true); setEditArticle({ ...editArticle, folder_id: null }); }} className="p-1 hover:bg-black/5 rounded transition-colors">
                    <Plus className="w-3 h-3" />
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto p-2">
                  <DroppableFolder 
                    id={null} 
                    className="mb-2"
                  >
                    <button
                      onClick={() => handleFolderClick(null)}
                      className={cn(
                        "w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-all",
                        selectedFolderId === null ? "bg-black text-white shadow-md" : "hover:bg-black/5 text-black/70"
                      )}
                    >
                      <Folder className={cn("w-4 h-4", selectedFolderId === null ? "text-white" : "text-black/20")} />
                      All Knowledge
                    </button>
                  </DroppableFolder>

                  <div className="space-y-1">
                    {isCreatingFolder && !editArticle.folder_id && (
                      <div className="px-3 py-2 space-y-2 bg-black/5 rounded-xl mb-1">
                        <input 
                          autoFocus
                          type="text" 
                          placeholder="Folder name..."
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
                    {folders.filter(f => f.parent_id === null).map(folder => (
                      <FolderTreeItem 
                        key={folder.id}
                        folder={folder}
                        folders={folders}
                        selectedFolderId={selectedFolderId}
                        expandedFolderIds={expandedFolderIds}
                        editingFolderId={editingFolderId}
                        editFolderName={editFolderName}
                        setEditFolderName={setEditFolderName}
                        onFolderClick={handleFolderClick}
                        onToggleExpansion={toggleFolderExpansion}
                        onRename={handleRenameFolder}
                        onDelete={handleDeleteFolder}
                        setEditingFolderId={setEditingFolderId}
                        isCreatingFolder={isCreatingFolder}
                        setIsCreatingFolder={setIsCreatingFolder}
                        newFolderName={newFolderName}
                        setNewFolderName={setNewFolderName}
                        onCreateFolder={handleCreateFolder}
                        editArticle={editArticle}
                        setEditArticle={setEditArticle}
                      />
                    ))}
                  </div>
                </div>
              </div>

              {/* Column 2: Article List */}
              <div className="w-80 border-r border-black/5 flex flex-col bg-[#FAFAFA] shrink-0">
                <div className="p-4 border-b border-black/5 flex items-center justify-between bg-white">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-black/40">Articles</span>
                  <div className="flex gap-2">
                    <button 
                      onClick={() => {
                        if (selectedArticleIds.length === articles.length) setSelectedArticleIds([]);
                        else setSelectedArticleIds(articles.map(a => a.id));
                      }}
                      className="p-1 hover:bg-black/5 rounded transition-colors"
                    >
                      {selectedArticleIds.length === articles.length ? <CheckSquare className="w-3 h-3" /> : <Square className="w-3 h-3" />}
                    </button>
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto">
                  {articles.length === 0 ? (
                    <div className="p-8 text-center opacity-20">
                      <FileText className="w-8 h-8 mx-auto mb-3" />
                      <p className="text-xs font-bold uppercase">No articles</p>
                    </div>
                  ) : (
                    <div className="flex flex-col p-2 gap-1">
                      {articles.map(article => (
                        <DraggableArticle key={article.id} article={article}>
                          <button
                            onClick={(e) => handleArticleClick(article.id, e.shiftKey || e.metaKey || e.ctrlKey)}
                            className={cn(
                              "w-full text-left p-4 rounded-2xl transition-all group relative",
                              selectedArticleId === article.id ? "bg-white shadow-lg ring-1 ring-black/5" : "hover:bg-white/50",
                              selectedArticleIds.includes(article.id) && "bg-indigo-50/30"
                            )}
                          >
                            <div className="flex items-start justify-between mb-1">
                              <h3 className={cn(
                                "font-semibold text-sm line-clamp-1",
                                selectedArticleId === article.id ? "text-black" : "text-black/70"
                              )}>
                                {article.title || "Untitled"}
                              </h3>
                              {article.expires_at && isPast(parseISO(article.expires_at)) && (
                                <AlertTriangle className="w-3 h-3 text-amber-500 shrink-0" />
                              )}
                            </div>
                            <p className="text-[10px] text-black/40 line-clamp-2 leading-relaxed">
                              {article.content?.replace(/<[^>]*>/g, '').slice(0, 100) || "No content..."}
                            </p>
                          </button>
                        </DraggableArticle>
                      ))}
                    </div>
                  )}
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

        <DragOverlay>
          {activeDragItem ? (
            <div className="bg-white p-4 rounded-2xl shadow-2xl border border-black/5 opacity-80 scale-105 pointer-events-none">
              <div className="flex items-center gap-3">
                {activeDragItem.type === 'folder' ? (
                  <Folder className="w-5 h-5 text-black/40" />
                ) : (
                  <FileText className="w-5 h-5 text-black/40" />
                )}
                <span className="text-sm font-medium">
                  {activeDragItem.type === 'folder' 
                    ? folders.find(f => f.id === activeDragItem.id)?.name 
                    : articles.find(a => a.id === activeDragItem.id)?.title}
                </span>
              </div>
            </div>
          ) : null}
        </DragOverlay>
      </main>
      </div>
    </DndContext>
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
          icon={LucideType} 
          label="Bold" 
        />
        <MenuButton 
          onClick={() => editor.chain().focus().toggleItalic().run()} 
          isActive={editor.isActive('italic')} 
          icon={LucideType} 
          label="Italic" 
        />
        <MenuButton 
          onClick={() => editor.chain().focus().toggleUnderline().run()} 
          isActive={editor.isActive('underline')} 
          icon={LucideType} 
          label="Underline" 
        />
        <MenuButton 
          onClick={() => editor.chain().focus().toggleStrike().run()} 
          isActive={editor.isActive('strike')} 
          icon={LucideType} 
          label="Strike" 
        />
        <div className="w-px h-6 bg-black/5 mx-1 self-center" />
        <MenuButton 
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} 
          isActive={editor.isActive('heading', { level: 1 })} 
          icon={LucideType} 
          label="H1" 
        />
        <MenuButton 
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} 
          isActive={editor.isActive('heading', { level: 2 })} 
          icon={LucideType} 
          label="H2" 
        />
        <MenuButton 
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} 
          isActive={editor.isActive('heading', { level: 3 })} 
          icon={LucideType} 
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

function QuizPlayer({ 
  quiz, 
  onClose,
  onViewArticle
}: { 
  quiz: Quiz, 
  onClose: () => void,
  onViewArticle: (id: number) => void
}) {
  const [currentQuestionIdx, setCurrentQuestionIdx] = useState(0);
  const [answers, setAnswers] = useState<number[]>([]);
  const [isFinished, setIsFinished] = useState(false);
  const [score, setScore] = useState(0);

  const handleAnswer = async (optionIdx: number) => {
    const newAnswers = [...answers];
    newAnswers[currentQuestionIdx] = optionIdx;
    setAnswers(newAnswers);

    if (currentQuestionIdx < (quiz.questions?.length || 0) - 1) {
      setCurrentQuestionIdx(currentQuestionIdx + 1);
    } else {
      // Calculate score
      let correct = 0;
      quiz.questions?.forEach((q, idx) => {
        if (newAnswers[idx] === q.correct_option_index) correct++;
      });
      setScore(correct);
      setIsFinished(true);

      // Submit results
      try {
        const userEmail = 'rowan@creativefabrica.com'; // From context
        const res = await fetch('/api/initial-data');
        const data = await res.json();
        const user = data.users?.find((u: any) => u.email === userEmail);
        
        if (user) {
          await fetch(`/api/quizzes/${quiz.id}/submit`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              user_id: user.id,
              score: correct,
              total_questions: quiz.questions?.length || 0
            })
          });
        }
      } catch (err) {
        console.error("Failed to submit quiz results:", err);
      }
    }
  };

  if (isFinished) {
    return (
      <div className="flex-1 flex flex-col bg-[#FAFAFA] overflow-y-auto custom-scrollbar">
        <div className="flex-1 flex items-center justify-center p-8">
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="max-w-2xl w-full bg-white p-12 rounded-[40px] shadow-2xl shadow-black/5 text-center space-y-8"
          >
            <div className="w-24 h-24 bg-emerald-50 text-emerald-500 rounded-full flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-12 h-12" />
            </div>
            <div className="space-y-2">
              <h3 className="text-3xl font-bold">Quiz Complete!</h3>
              <p className="text-black/40">Great job completing the knowledge check.</p>
            </div>
            <div className="bg-[#F5F5F5] p-8 rounded-3xl">
              <p className="text-[10px] font-bold uppercase tracking-widest text-black/40 mb-1">Your Score</p>
              <p className="text-5xl font-black text-black">
                {score} <span className="text-2xl text-black/20">/ {quiz.questions?.length}</span>
              </p>
            </div>

            <div className="space-y-6 text-left">
              <h4 className="text-sm font-bold uppercase tracking-widest text-black/20 border-b border-black/5 pb-2">Review & Feedback</h4>
              <div className="space-y-4">
                {quiz.questions?.map((q, idx) => {
                  const isCorrect = answers[idx] === q.correct_option_index;
                  return (
                    <div key={idx} className={cn(
                      "p-6 rounded-3xl border transition-all",
                      isCorrect ? "bg-emerald-50/30 border-emerald-100" : "bg-red-50/30 border-red-100"
                    )}>
                      <div className="flex items-start gap-4">
                        <div className={cn(
                          "w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0",
                          isCorrect ? "bg-emerald-500 text-white" : "bg-red-500 text-white"
                        )}>
                          {idx + 1}
                        </div>
                        <div className="space-y-3">
                          <p className="font-bold text-sm">{q.question}</p>
                          <div className="space-y-1">
                            <p className="text-xs text-black/40">Your answer: <span className={isCorrect ? "text-emerald-600 font-bold" : "text-red-600 font-bold"}>{q.options[answers[idx]]}</span></p>
                            {!isCorrect && <p className="text-xs text-black/40">Correct answer: <span className="text-emerald-600 font-bold">{q.options[q.correct_option_index]}</span></p>}
                          </div>
                          {(q.feedback || q.article_id) && (
                            <div className="bg-white/50 p-4 rounded-2xl space-y-2">
                              {q.feedback && (
                                <div className="flex gap-2">
                                  <Info className="w-3.5 h-3.5 text-indigo-500 shrink-0 mt-0.5" />
                                  <p className="text-xs text-black/60 leading-relaxed">{q.feedback}</p>
                                </div>
                              )}
                              {q.article_id && (
                                <button 
                                  onClick={() => onViewArticle(q.article_id!)}
                                  className="flex items-center gap-1.5 text-[10px] font-bold text-indigo-500 hover:text-indigo-600 uppercase tracking-wider"
                                >
                                  <FileText className="w-3 h-3" />
                                  Read Related Article
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <button 
              onClick={onClose}
              className="w-full bg-black text-white py-4 rounded-2xl font-bold hover:bg-black/80 transition-all"
            >
              Back to Knowledge Base
            </button>
          </motion.div>
        </div>
      </div>
    );
  }

  const currentQuestion = quiz.questions?.[currentQuestionIdx];

  return (
    <div className="flex-1 flex flex-col bg-[#FAFAFA] overflow-hidden">
      <div className="p-8 border-b border-black/5 bg-white flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button onClick={onClose} className="p-2 hover:bg-black/5 rounded-xl transition-colors">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div>
            <h3 className="font-bold">{quiz.title}</h3>
            <p className="text-xs text-black/40">Question {currentQuestionIdx + 1} of {quiz.questions?.length}</p>
          </div>
        </div>
        <div className="w-48 h-2 bg-black/5 rounded-full overflow-hidden">
          <motion.div 
            className="h-full bg-black"
            initial={{ width: 0 }}
            animate={{ width: `${((currentQuestionIdx + 1) / (quiz.questions?.length || 1)) * 100}%` }}
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-8">
        <div className="max-w-2xl mx-auto space-y-12 py-12">
          <motion.div 
            key={currentQuestionIdx}
            initial={{ x: 20, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            className="space-y-8"
          >
            <h4 className="text-3xl font-bold leading-tight">{currentQuestion?.question}</h4>
            <div className="grid grid-cols-1 gap-4">
              {currentQuestion?.options.map((opt, idx) => (
                <button 
                  key={idx}
                  onClick={() => handleAnswer(idx)}
                  className="group flex items-center gap-6 p-6 bg-white border border-black/5 rounded-3xl hover:border-black/20 hover:shadow-xl hover:shadow-black/[0.02] transition-all text-left"
                >
                  <span className="w-10 h-10 rounded-2xl bg-[#F5F5F5] group-hover:bg-black group-hover:text-white flex items-center justify-center font-bold transition-colors">
                    {String.fromCharCode(65 + idx)}
                  </span>
                  <span className="text-lg font-medium text-black/70 group-hover:text-black transition-colors">{opt}</span>
                </button>
              ))}
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}

function QuizManager({ 
  teams, 
  quizzes, 
  articles,
  onUpdateQuizzes,
  currentUser
}: { 
  teams: Team[], 
  quizzes: Quiz[], 
  articles: Article[],
  onUpdateQuizzes: (quizzes: Quiz[]) => void,
  currentUser: User | null
}) {
  const [isCreating, setIsCreating] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [showStats, setShowStats] = useState<number | null>(null);
  const [quizStats, setQuizStats] = useState<any>(null);
  const [timeRange, setTimeRange] = useState('7');
  const [newQuiz, setNewQuiz] = useState<Partial<Quiz>>({
    title: '',
    description: '',
    team_id: null,
    expires_at: '',
    status: 'draft',
    questions: []
  });

  const fetchStats = async (quizId: number) => {
    try {
      const res = await fetch(`/api/quizzes/${quizId}/stats`);
      if (res.ok) {
        setQuizStats(await res.json());
        setShowStats(quizId);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleGenerateQuiz = async () => {
    if (!currentUser) return;
    setIsGenerating(true);
    try {
      const res = await fetch(`/api/admin/quiz-content?days=${timeRange}`);
      const content = await res.json();
      
      const context = [
        ...content.articles.map((a: any) => `Article ID: ${a.id}\nTitle: ${a.title}\nContent: ${a.content}`),
        ...content.announcements.map((a: any) => `Announcement: ${a.message}`)
      ].join('\n\n');

      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Based on the following knowledge base updates, generate a 5-question multiple choice quiz. 
        Return the result as a JSON array of objects, each with:
        - 'question': the question text
        - 'options': array of 4 strings
        - 'correct_option_index': 0-3
        - 'feedback': a brief explanation of the correct answer
        - 'article_id': the ID of the article used to generate this question (if applicable, otherwise null)
        
        Updates:
        ${context}`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                question: { type: Type.STRING },
                options: { type: Type.ARRAY, items: { type: Type.STRING } },
                correct_option_index: { type: Type.INTEGER },
                feedback: { type: Type.STRING },
                article_id: { type: Type.INTEGER }
              },
              required: ["question", "options", "correct_option_index", "feedback"]
            }
          }
        }
      });

      const generatedQuestions = JSON.parse(response.text || '[]');
      setNewQuiz({
        ...newQuiz,
        title: `Knowledge Check - ${format(new Date(), 'MMM d')}`,
        description: `A quick quiz based on updates from the last ${timeRange} days.`,
        questions: generatedQuestions
      });
    } catch (err) {
      console.error(err);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSaveQuiz = async (status: 'draft' | 'published') => {
    if (!currentUser || !newQuiz.title) return;
    try {
      const res = await fetch('/api/quizzes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...newQuiz, status, created_by: currentUser.id })
      });
      if (res.ok) {
        const { id } = await res.json();
        if (status === 'published') {
          // Send notification
          await fetch('/api/announcements', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              message: `New Quiz Available: ${newQuiz.title}. Please complete it by ${newQuiz.expires_at ? format(parseISO(newQuiz.expires_at), 'MMM d') : 'the deadline'}.`,
              team_id: newQuiz.team_id,
              sender_id: currentUser.id
            })
          });
        }
        const qRes = await fetch('/api/quizzes');
        if (qRes.ok) onUpdateQuizzes(await qRes.json());
        setIsCreating(false);
        setNewQuiz({ title: '', description: '', team_id: null, expires_at: '', status: 'draft', questions: [] });
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteQuiz = async (id: number) => {
    if (!confirm('Delete this quiz?')) return;
    try {
      const res = await fetch(`/api/quizzes/${id}`, { method: 'DELETE' });
      if (res.ok) onUpdateQuizzes(quizzes.filter(q => q.id !== id));
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">Quiz Management</h3>
        {!isCreating && (
          <button 
            onClick={() => setIsCreating(true)}
            className="bg-black text-white px-4 py-2 rounded-xl text-sm font-medium flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Create New Quiz
          </button>
        )}
      </div>

      {isCreating ? (
        <div className="bg-white p-8 rounded-3xl border border-black/5 shadow-sm space-y-8">
          <div className="flex justify-between items-start">
            <div className="space-y-1">
              <h4 className="text-xl font-bold">Create Knowledge Quiz</h4>
              <p className="text-sm text-black/40">Generate a quiz from recent updates or create one manually.</p>
            </div>
            <button onClick={() => setIsCreating(false)} className="text-black/20 hover:text-black">
              <X className="w-6 h-6" />
            </button>
          </div>

          <div className="grid grid-cols-3 gap-6">
            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-wider text-black/40">Time Period</label>
              <div className="flex gap-2">
                <select 
                  className="flex-1 bg-[#F5F5F5] border-none rounded-xl px-4 py-3 text-sm outline-none"
                  value={timeRange}
                  onChange={e => setTimeRange(e.target.value)}
                >
                  <option value="7">Last 7 Days</option>
                  <option value="30">Last Month</option>
                  <option value="90">Last 3 Months</option>
                </select>
                <button 
                  onClick={handleGenerateQuiz}
                  disabled={isGenerating}
                  className="bg-indigo-500 text-white px-4 py-3 rounded-xl text-sm font-medium flex items-center gap-2 hover:bg-indigo-600 transition-colors disabled:opacity-50"
                >
                  {isGenerating ? <Sparkles className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  AI Generate
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-wider text-black/40">Target Group</label>
              <select 
                className="w-full bg-[#F5F5F5] border-none rounded-xl px-4 py-3 text-sm outline-none"
                value={newQuiz.team_id || ''}
                onChange={e => setNewQuiz({...newQuiz, team_id: e.target.value ? parseInt(e.target.value) : null})}
              >
                <option value="">All Users</option>
                {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-wider text-black/40">Completion Deadline</label>
              <input 
                type="date"
                className="w-full bg-[#F5F5F5] border-none rounded-xl px-4 py-3 text-sm outline-none"
                value={newQuiz.expires_at || ''}
                onChange={e => setNewQuiz({...newQuiz, expires_at: e.target.value})}
              />
            </div>
          </div>

          <div className="space-y-4">
            <input 
              placeholder="Quiz Title"
              className="w-full text-2xl font-bold bg-transparent border-none outline-none placeholder:text-black/10"
              value={newQuiz.title}
              onChange={e => setNewQuiz({...newQuiz, title: e.target.value})}
            />
            <textarea 
              placeholder="Quiz Description"
              className="w-full bg-[#F5F5F5] border-none rounded-xl px-4 py-3 text-sm outline-none resize-none h-20"
              value={newQuiz.description}
              onChange={e => setNewQuiz({...newQuiz, description: e.target.value})}
            />
          </div>

          <div className="space-y-6">
            <div className="flex items-center justify-between border-b border-black/5 pb-2">
              <h5 className="text-sm font-bold uppercase tracking-wider text-black/40">Questions ({newQuiz.questions?.length || 0})</h5>
              <button 
                onClick={() => setNewQuiz({
                  ...newQuiz, 
                  questions: [...(newQuiz.questions || []), { question: '', options: ['', '', '', ''], correct_option_index: 0 }]
                })}
                className="text-xs font-bold text-indigo-500 hover:text-indigo-600 flex items-center gap-1"
              >
                <Plus className="w-3 h-3" /> Add Question
              </button>
            </div>

            <div className="space-y-8">
              {newQuiz.questions?.map((q, qIdx) => (
                <div key={qIdx} className="space-y-4 p-6 bg-[#F5F5F5] rounded-2xl relative group">
                  <button 
                    onClick={() => setNewQuiz({
                      ...newQuiz,
                      questions: newQuiz.questions?.filter((_, i) => i !== qIdx)
                    })}
                    className="absolute top-4 right-4 text-black/10 hover:text-red-500 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                  <div className="flex gap-4">
                    <span className="w-8 h-8 bg-black text-white rounded-full flex items-center justify-center text-xs font-bold shrink-0">{qIdx + 1}</span>
                    <input 
                      placeholder="Enter question..."
                      className="flex-1 bg-transparent border-none font-semibold outline-none"
                      value={q.question}
                      onChange={e => {
                        const qs = [...(newQuiz.questions || [])];
                        qs[qIdx].question = e.target.value;
                        setNewQuiz({...newQuiz, questions: qs});
                      }}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3 pl-12">
                    {q.options.map((opt, oIdx) => (
                      <div key={oIdx} className="flex items-center gap-3">
                        <button 
                          onClick={() => {
                            const qs = [...(newQuiz.questions || [])];
                            qs[qIdx].correct_option_index = oIdx;
                            setNewQuiz({...newQuiz, questions: qs});
                          }}
                          className={cn(
                            "w-5 h-5 rounded-full border flex items-center justify-center transition-all",
                            q.correct_option_index === oIdx ? "bg-emerald-500 border-emerald-500 text-white" : "border-black/10 hover:border-black/30"
                          )}
                        >
                          {q.correct_option_index === oIdx && <CheckCircle2 className="w-3 h-3" />}
                        </button>
                        <input 
                          placeholder={`Option ${oIdx + 1}`}
                          className="flex-1 bg-white border border-black/5 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500/20"
                          value={opt}
                          onChange={e => {
                            const qs = [...(newQuiz.questions || [])];
                            qs[qIdx].options[oIdx] = e.target.value;
                            setNewQuiz({...newQuiz, questions: qs});
                          }}
                        />
                      </div>
                    ))}
                  </div>
                  <div className="pl-12 space-y-3">
                    <div className="flex gap-3">
                      <div className="flex-1 space-y-1">
                        <label className="text-[10px] font-bold uppercase tracking-wider text-black/30">Feedback for this question</label>
                        <textarea 
                          placeholder="Explain why the answer is correct..."
                          className="w-full bg-white border border-black/5 rounded-xl px-4 py-2 text-xs outline-none focus:ring-2 focus:ring-indigo-500/20 resize-none h-16"
                          value={q.feedback || ''}
                          onChange={e => {
                            const qs = [...(newQuiz.questions || [])];
                            qs[qIdx].feedback = e.target.value;
                            setNewQuiz({...newQuiz, questions: qs});
                          }}
                        />
                      </div>
                      <div className="w-64 space-y-1">
                        <label className="text-[10px] font-bold uppercase tracking-wider text-black/30">Link to Article</label>
                        <select 
                          className="w-full bg-white border border-black/5 rounded-xl px-4 py-2 text-xs outline-none focus:ring-2 focus:ring-indigo-500/20"
                          value={q.article_id || ''}
                          onChange={e => {
                            const qs = [...(newQuiz.questions || [])];
                            qs[qIdx].article_id = e.target.value ? parseInt(e.target.value) : null;
                            setNewQuiz({...newQuiz, questions: qs});
                          }}
                        >
                          <option value="">No Article Link</option>
                          {articles.map(a => <option key={a.id} value={a.id}>{a.title}</option>)}
                        </select>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-6 border-t border-black/5">
            <button 
              onClick={() => setIsCreating(false)}
              className="px-6 py-3 rounded-xl text-sm font-medium border border-black/10 hover:bg-black/5 transition-colors"
            >
              Cancel
            </button>
            <button 
              onClick={() => handleSaveQuiz('draft')}
              className="px-6 py-3 rounded-xl text-sm font-medium bg-[#F5F5F5] hover:bg-black/5 transition-colors"
            >
              Save as Draft
            </button>
            <button 
              onClick={() => handleSaveQuiz('published')}
              className="px-8 py-3 rounded-xl text-sm font-medium bg-black text-white hover:bg-black/80 transition-all shadow-lg shadow-black/10 flex items-center gap-2"
            >
              <Send className="w-4 h-4" />
              Publish & Notify
            </button>
          </div>
        </div>
      ) : showStats && quizStats ? (
        <div className="bg-white p-8 rounded-3xl border border-black/5 shadow-sm space-y-8">
          <div className="flex justify-between items-start">
            <div className="space-y-1">
              <h4 className="text-xl font-bold">Quiz Performance: {quizzes.find(q => q.id === showStats)?.title}</h4>
              <p className="text-sm text-black/40">Detailed breakdown of submissions and team performance.</p>
            </div>
            <button onClick={() => setShowStats(null)} className="text-black/20 hover:text-black">
              <X className="w-6 h-6" />
            </button>
          </div>

          <div className="grid grid-cols-4 gap-6">
            <div className="bg-[#F5F5F5] p-6 rounded-3xl">
              <p className="text-[10px] font-bold uppercase tracking-widest text-black/40 mb-1">Average Score</p>
              <p className="text-3xl font-black text-black">{Math.round(quizStats.averageScore)}%</p>
            </div>
            <div className="bg-[#F5F5F5] p-6 rounded-3xl">
              <p className="text-[10px] font-bold uppercase tracking-widest text-black/40 mb-1">Submissions</p>
              <p className="text-3xl font-black text-black">{quizStats.submissions.length}</p>
            </div>
            <div className="bg-[#F5F5F5] p-6 rounded-3xl">
              <p className="text-[10px] font-bold uppercase tracking-widest text-black/40 mb-1">Pending</p>
              <p className="text-3xl font-black text-black">{quizStats.pendingUsers.length}</p>
            </div>
            <div className="bg-[#F5F5F5] p-6 rounded-3xl">
              <p className="text-[10px] font-bold uppercase tracking-widest text-black/40 mb-1">Team Avg</p>
              <p className="text-3xl font-black text-black">{quizStats.teamAverages.length > 0 ? Math.round(quizStats.teamAverages[0].average) : 0}%</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-8">
            <div className="space-y-4">
              <h5 className="text-sm font-bold uppercase tracking-widest text-black/20 border-b border-black/5 pb-2">Scoreboard</h5>
              <div className="space-y-2">
                {quizStats.submissions.map((s: any) => (
                  <div key={s.id} className="flex items-center justify-between p-4 bg-[#F5F5F5] rounded-2xl">
                    <div>
                      <p className="font-bold text-sm">{s.user_name}</p>
                      <p className="text-[10px] text-black/40 uppercase font-bold">{s.team_name || 'No Team'}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-black text-lg">{Math.round((s.score / s.total_questions) * 100)}%</p>
                      <p className="text-[10px] text-black/40">{format(parseISO(s.submitted_at), 'MMM d, HH:mm')}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-8">
              <div className="space-y-4">
                <h5 className="text-sm font-bold uppercase tracking-widest text-black/20 border-b border-black/5 pb-2">Pending Submissions</h5>
                <div className="space-y-2">
                  {quizStats.pendingUsers.map((u: any) => {
                    const quiz = quizzes.find(q => q.id === showStats);
                    const isExpired = quiz?.expires_at && isPast(parseISO(quiz.expires_at));
                    return (
                      <div key={u.id} className="flex items-center justify-between p-4 bg-[#F5F5F5] rounded-2xl">
                        <div>
                          <p className="font-bold text-sm">{u.name}</p>
                          <p className="text-[10px] text-black/40">{u.email}</p>
                        </div>
                        {isExpired ? (
                          <span className="bg-red-50 text-red-600 px-2 py-1 rounded text-[10px] font-bold uppercase">Expired</span>
                        ) : (
                          <span className="bg-amber-50 text-amber-600 px-2 py-1 rounded text-[10px] font-bold uppercase">Pending</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-4">
                <h5 className="text-sm font-bold uppercase tracking-widest text-black/20 border-b border-black/5 pb-2">Team Averages</h5>
                <div className="space-y-2">
                  {quizStats.teamAverages.map((t: any, idx: number) => (
                    <div key={idx} className="flex items-center justify-between p-4 bg-[#F5F5F5] rounded-2xl">
                      <p className="font-bold text-sm">{t.team_name}</p>
                      <p className="font-black text-lg">{Math.round(t.average)}%</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {quizzes.length === 0 ? (
            <div className="text-center py-20 bg-white rounded-3xl border border-black/5">
              <Brain className="w-12 h-12 text-black/5 mx-auto mb-4" />
              <p className="text-black/40">No quizzes created yet.</p>
            </div>
          ) : (
            quizzes.map(quiz => (
              <div key={quiz.id} className="bg-white p-6 rounded-2xl border border-black/5 shadow-sm flex items-center justify-between group hover:border-black/10 transition-all">
                <div className="flex items-center gap-4">
                  <div className={cn(
                    "w-12 h-12 rounded-xl flex items-center justify-center",
                    quiz.status === 'published' ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600"
                  )}>
                    <Brain className="w-6 h-6" />
                  </div>
                  <div>
                    <h4 className="font-semibold">{quiz.title}</h4>
                    <div className="flex items-center gap-3 text-xs text-black/40 mt-1">
                      <span className="flex items-center gap-1">
                        <Users className="w-3 h-3" />
                        {quiz.team_name || 'All Users'}
                      </span>
                      <span>•</span>
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {format(parseISO(quiz.created_at), 'MMM d, yyyy')}
                      </span>
                      {quiz.expires_at && (
                        <>
                          <span>•</span>
                          <span className={cn(
                            "flex items-center gap-1",
                            isPast(parseISO(quiz.expires_at)) ? "text-red-500 font-bold" : ""
                          )}>
                            <Clock className="w-3 h-3" />
                            Due {format(parseISO(quiz.expires_at), 'MMM d')}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className={cn(
                    "px-2 py-1 rounded text-[10px] font-bold uppercase",
                    quiz.status === 'published' ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600"
                  )}>
                    {quiz.status}
                  </span>
                  {quiz.status === 'published' && (
                    <button 
                      onClick={() => fetchStats(quiz.id)}
                      className="p-2 text-black/10 hover:text-indigo-500 transition-colors"
                    >
                      <List className="w-4 h-4" />
                    </button>
                  )}
                  <button 
                    onClick={() => handleDeleteQuiz(quiz.id)}
                    className="p-2 text-black/10 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function AdminPanel({ 
  users, 
  teams, 
  folders, 
  articles,
  folderAccess, 
  quizzes,
  onUpdateUsers, 
  onUpdateTeams, 
  onUpdateFolderAccess,
  onUpdateArticles,
  onUpdateQuizzes,
  currentUser
}: { 
  users: User[], 
  teams: Team[], 
  folders: FolderType[], 
  articles: Article[],
  folderAccess: FolderAccess[],
  quizzes: Quiz[],
  onUpdateUsers: (users: User[]) => void,
  onUpdateTeams: (teams: Team[]) => void,
  onUpdateFolderAccess: (access: FolderAccess[]) => void,
  onUpdateArticles: (articles: Article[]) => void,
  onUpdateQuizzes: (quizzes: Quiz[]) => void,
  currentUser: User | null
}) {
  const [activeTab, setActiveTab] = useState<'users' | 'groups' | 'folders' | 'articles' | 'quizzes'>('users');
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
          { id: 'articles', label: 'Article Manager', icon: FileText },
          { id: 'quizzes', label: 'Quizzes', icon: Brain }
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

          {activeTab === 'quizzes' && (
            <QuizManager 
              teams={teams} 
              quizzes={quizzes} 
              articles={articles}
              onUpdateQuizzes={onUpdateQuizzes}
              currentUser={currentUser}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// --- Sub-components ---


