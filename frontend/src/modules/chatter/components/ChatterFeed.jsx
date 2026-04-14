/**
 * ChatterFeed - Main Chatter Feed Component (Salesforce-style)
 */
import React, { useState, useEffect, useCallback } from 'react';
import { formatDistanceToNow, format } from 'date-fns';
import { 
  MessageCircle, Heart, ThumbsUp, PartyPopper, Lightbulb, HelpCircle,
  MoreHorizontal, Edit2, Trash2, Share2, Pin, Clock, Filter,
  ChevronDown, ChevronUp, Send, Loader2, User, Bell
} from 'lucide-react';
import { Button } from '../../../components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../../components/ui/dropdown-menu';
import RichTextEditor from './RichTextEditor';
import chatterService from '../services/chatterService';
import toast from 'react-hot-toast';

// Reaction Icons Map
const REACTION_ICONS = {
  LIKE: ThumbsUp,
  LOVE: Heart,
  CELEBRATE: PartyPopper,
  INSIGHTFUL: Lightbulb,
  CURIOUS: HelpCircle,
};

const REACTION_LABELS = {
  LIKE: 'Like',
  LOVE: 'Love',
  CELEBRATE: 'Celebrate',
  INSIGHTFUL: 'Insightful',
  CURIOUS: 'Curious',
};

// Avatar Component
const Avatar = ({ name, url, size = 'md' }) => {
  const sizeClasses = {
    sm: 'w-7 h-7 text-xs',
    md: 'w-10 h-10 text-sm',
    lg: 'w-12 h-12 text-base',
  };

  if (url) {
    return (
      <img 
        src={url} 
        alt={name}
        className={`${sizeClasses[size]} rounded-full object-cover`}
      />
    );
  }

  return (
    <div className={`${sizeClasses[size]} rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white font-medium`}>
      {name?.[0]?.toUpperCase() || <User className="w-1/2 h-1/2" />}
    </div>
  );
};

// Reaction Picker Component
const ReactionPicker = ({ onSelect, currentReaction }) => {
  return (
    <div className="flex items-center gap-1 p-1 bg-white border rounded-full shadow-lg">
      {Object.entries(REACTION_ICONS).map(([type, Icon]) => (
        <button
          key={type}
          onClick={() => onSelect(type)}
          className={`p-1.5 rounded-full hover:bg-slate-100 transition-colors ${
            currentReaction === type ? 'bg-blue-100 text-blue-600' : 'text-slate-600'
          }`}
          title={REACTION_LABELS[type]}
        >
          <Icon className="h-4 w-4" />
        </button>
      ))}
    </div>
  );
};

// Comment Component
const Comment = ({ comment, postId, onUpdate, onDelete, currentUserId }) => {
  const [showReplyEditor, setShowReplyEditor] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [replies, setReplies] = useState([]);
  const [showReplies, setShowReplies] = useState(false);
  const [liked, setLiked] = useState(false);

  const isOwner = comment.author?.user_id === currentUserId;

  const handleLike = async () => {
    try {
      if (liked) {
        await chatterService.removeReaction('comment', comment.id);
      } else {
        await chatterService.addReaction('comment', comment.id, 'LIKE');
      }
      setLiked(!liked);
    } catch (err) {
      toast.error('Failed to update reaction');
    }
  };

  const handleReply = async (replyData) => {
    try {
      const newComment = await chatterService.createComment({
        post_id: postId,
        parent_comment_id: comment.id,
        ...replyData
      });
      setReplies(prev => [...prev, newComment]);
      setShowReplyEditor(false);
      toast.success('Reply posted');
    } catch (err) {
      toast.error('Failed to post reply');
    }
  };

  const loadReplies = async () => {
    if (comment.reply_count > 0 && replies.length === 0) {
      try {
        const data = await chatterService.getComments(postId, { parentCommentId: comment.id });
        setReplies(data);
      } catch (err) {
        console.error('Failed to load replies:', err);
      }
    }
    setShowReplies(!showReplies);
  };

  return (
    <div className="flex gap-2" data-testid={`comment-${comment.id}`}>
      <Avatar name={comment.author?.name} url={comment.author?.avatar_url} size="sm" />
      <div className="flex-1 min-w-0">
        <div className="bg-slate-50 rounded-lg p-2.5">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-medium text-slate-900">{comment.author?.name}</span>
            <span className="text-xs text-slate-400">
              {formatDistanceToNow(new Date(comment.created_at), { addSuffix: true })}
            </span>
            {comment.is_edited && <span className="text-xs text-slate-400">(edited)</span>}
          </div>
          {isEditing ? (
            <RichTextEditor
              initialContent={comment.content}
              compact
              submitLabel="Save"
              onSubmit={async (data) => {
                await onUpdate(comment.id, data);
                setIsEditing(false);
              }}
              onCancel={() => setIsEditing(false)}
            />
          ) : (
            <div 
              className="text-sm text-slate-700 prose prose-sm max-w-none"
              dangerouslySetInnerHTML={{ __html: comment.content }}
            />
          )}
        </div>
        
        {/* Comment Actions */}
        <div className="flex items-center gap-3 mt-1 ml-1">
          <button 
            onClick={handleLike}
            className={`text-xs font-medium hover:text-blue-600 ${liked ? 'text-blue-600' : 'text-slate-500'}`}
          >
            Like {comment.like_count > 0 && `(${comment.like_count})`}
          </button>
          <button 
            onClick={() => setShowReplyEditor(!showReplyEditor)}
            className="text-xs font-medium text-slate-500 hover:text-blue-600"
          >
            Reply
          </button>
          {comment.reply_count > 0 && (
            <button 
              onClick={loadReplies}
              className="text-xs font-medium text-slate-500 hover:text-blue-600 flex items-center gap-1"
            >
              {showReplies ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              {comment.reply_count} {comment.reply_count === 1 ? 'reply' : 'replies'}
            </button>
          )}
          {isOwner && (
            <>
              <button 
                onClick={() => setIsEditing(true)}
                className="text-xs font-medium text-slate-500 hover:text-blue-600"
              >
                Edit
              </button>
              <button 
                onClick={() => onDelete(comment.id)}
                className="text-xs font-medium text-slate-500 hover:text-red-600"
              >
                Delete
              </button>
            </>
          )}
        </div>
        
        {/* Reply Editor */}
        {showReplyEditor && (
          <div className="mt-2">
            <RichTextEditor
              placeholder="Write a reply..."
              compact
              submitLabel="Reply"
              onSubmit={handleReply}
              onCancel={() => setShowReplyEditor(false)}
            />
          </div>
        )}
        
        {/* Nested Replies */}
        {showReplies && replies.length > 0 && (
          <div className="mt-2 space-y-2 pl-4 border-l-2 border-slate-200">
            {replies.map(reply => (
              <Comment 
                key={reply.id}
                comment={reply}
                postId={postId}
                onUpdate={onUpdate}
                onDelete={onDelete}
                currentUserId={currentUserId}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// Post Card Component
const PostCard = ({ post, onUpdate, onDelete, currentUserId }) => {
  const [showComments, setShowComments] = useState(false);
  const [comments, setComments] = useState([]);
  const [loadingComments, setLoadingComments] = useState(false);
  const [showReactionPicker, setShowReactionPicker] = useState(false);
  const [userReaction, setUserReaction] = useState(post.user_reaction || null);
  const [likeCount, setLikeCount] = useState(post.like_count || 0);
  const [isEditing, setIsEditing] = useState(false);
  const [localCommentCount, setLocalCommentCount] = useState(post.comment_count || 0);

  const isOwner = post.author?.user_id === currentUserId;
  const ReactionIcon = userReaction ? REACTION_ICONS[userReaction] : ThumbsUp;

  const loadComments = async () => {
    if (!showComments) {
      setLoadingComments(true);
      try {
        const data = await chatterService.getComments(post.id);
        setComments(data);
      } catch (err) {
        toast.error('Failed to load comments');
      } finally {
        setLoadingComments(false);
      }
    }
    setShowComments(!showComments);
  };

  const handleReaction = async (reactionType) => {
    try {
      if (userReaction === reactionType) {
        await chatterService.removeReaction('post', post.id);
        setUserReaction(null);
        setLikeCount(prev => prev - 1);
      } else {
        await chatterService.addReaction('post', post.id, reactionType);
        if (!userReaction) {
          setLikeCount(prev => prev + 1);
        }
        setUserReaction(reactionType);
      }
      setShowReactionPicker(false);
    } catch (err) {
      toast.error('Failed to update reaction');
    }
  };

  const handleAddComment = async (commentData) => {
    try {
      const newComment = await chatterService.createComment({
        post_id: post.id,
        ...commentData
      });
      setComments(prev => [...prev, newComment]);
      setLocalCommentCount(prev => prev + 1);
      toast.success('Comment posted');
    } catch (err) {
      toast.error('Failed to post comment');
    }
  };

  const handleUpdateComment = async (commentId, updateData) => {
    try {
      const updated = await chatterService.updateComment(commentId, updateData);
      setComments(prev => prev.map(c => c.id === commentId ? updated : c));
      toast.success('Comment updated');
    } catch (err) {
      toast.error('Failed to update comment');
    }
  };

  const handleDeleteComment = async (commentId) => {
    if (!window.confirm('Delete this comment?')) return;
    try {
      await chatterService.deleteComment(commentId);
      setComments(prev => prev.filter(c => c.id !== commentId));
      setLocalCommentCount(prev => prev - 1);
      toast.success('Comment deleted');
    } catch (err) {
      toast.error('Failed to delete comment');
    }
  };

  const handleEditPost = async (updateData) => {
    try {
      await onUpdate(post.id, updateData);
      setIsEditing(false);
    } catch (err) {
      toast.error('Failed to update post');
    }
  };

  return (
    <div 
      className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden"
      data-testid={`post-${post.id}`}
    >
      {/* Post Header */}
      <div className="flex items-start justify-between p-4">
        <div className="flex items-center gap-3">
          <Avatar name={post.author?.name} url={post.author?.avatar_url} />
          <div>
            <div className="flex items-center gap-2">
              <span className="font-medium text-slate-900">{post.author?.name}</span>
              {post.is_pinned && <Pin className="h-3.5 w-3.5 text-amber-500" />}
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <Clock className="h-3 w-3" />
              <span>{format(new Date(post.created_at), 'MMM d, yyyy')} at {format(new Date(post.created_at), 'h:mm a')}</span>
              {post.is_edited && <span className="text-slate-400">(edited)</span>}
            </div>
          </div>
        </div>
        
        {/* Post Actions Menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {isOwner && (
              <>
                <DropdownMenuItem onClick={() => setIsEditing(true)}>
                  <Edit2 className="h-4 w-4 mr-2" />
                  Edit Post
                </DropdownMenuItem>
                <DropdownMenuItem 
                  onClick={() => onDelete(post.id)}
                  className="text-red-600"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete Post
                </DropdownMenuItem>
              </>
            )}
            <DropdownMenuItem>
              <Share2 className="h-4 w-4 mr-2" />
              Share
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      
      {/* Post Content */}
      <div className="px-4 pb-3">
        {isEditing ? (
          <RichTextEditor
            initialContent={post.content}
            submitLabel="Save"
            onSubmit={handleEditPost}
            onCancel={() => setIsEditing(false)}
          />
        ) : (
          <div 
            className="prose prose-sm max-w-none text-slate-700"
            dangerouslySetInnerHTML={{ __html: post.content }}
          />
        )}
        
        {/* Attachments */}
        {post.attachments?.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-3">
            {post.attachments.map((file) => (
              <a
                key={file.id}
                href={file.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block"
              >
                {file.file_type?.startsWith('image/') ? (
                  <img 
                    src={file.url} 
                    alt={file.filename}
                    className="max-h-64 rounded-lg border"
                  />
                ) : (
                  <div className="px-3 py-2 bg-slate-100 rounded-lg text-sm text-slate-700 hover:bg-slate-200">
                    📎 {file.filename}
                  </div>
                )}
              </a>
            ))}
          </div>
        )}
      </div>
      
      {/* Engagement Stats */}
      {(likeCount > 0 || localCommentCount > 0) && (
        <div className="px-4 py-2 flex items-center justify-between text-sm text-slate-500 border-t">
          {likeCount > 0 && (
            <div className="flex items-center gap-1">
              <div className="flex -space-x-1">
                {Object.entries(post.reactions || {}).filter(([_, count]) => count > 0).slice(0, 3).map(([type]) => {
                  const Icon = REACTION_ICONS[type];
                  return Icon ? <Icon key={type} className="h-4 w-4 text-blue-500" /> : null;
                })}
              </div>
              <span>{likeCount}</span>
            </div>
          )}
          {localCommentCount > 0 && (
            <button onClick={loadComments} className="hover:underline">
              {localCommentCount} {localCommentCount === 1 ? 'comment' : 'comments'}
            </button>
          )}
        </div>
      )}
      
      {/* Action Buttons */}
      <div className="px-4 py-2 flex items-center justify-between border-t bg-slate-50">
        <div className="relative">
          <button
            onClick={() => userReaction ? handleReaction(userReaction) : setShowReactionPicker(!showReactionPicker)}
            onMouseEnter={() => setShowReactionPicker(true)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              userReaction 
                ? 'text-blue-600 bg-blue-50 hover:bg-blue-100' 
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <ReactionIcon className="h-4 w-4" />
            {userReaction ? REACTION_LABELS[userReaction] : 'Like'}
          </button>
          {showReactionPicker && (
            <div 
              className="absolute bottom-full left-0 mb-2"
              onMouseLeave={() => setShowReactionPicker(false)}
            >
              <ReactionPicker 
                onSelect={handleReaction}
                currentReaction={userReaction}
              />
            </div>
          )}
        </div>
        
        <button
          onClick={loadComments}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 transition-colors"
        >
          <MessageCircle className="h-4 w-4" />
          Comment
        </button>
        
        <button
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 transition-colors"
        >
          <Share2 className="h-4 w-4" />
          Share
        </button>
      </div>
      
      {/* Comments Section */}
      {showComments && (
        <div className="border-t">
          {/* Comment Input */}
          <div className="p-4 bg-slate-50">
            <RichTextEditor
              placeholder="Write a comment..."
              compact
              submitLabel="Post"
              onSubmit={handleAddComment}
            />
          </div>
          
          {/* Comments List */}
          {loadingComments ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
            </div>
          ) : comments.length > 0 ? (
            <div className="p-4 space-y-4 max-h-96 overflow-y-auto">
              {comments.map(comment => (
                <Comment 
                  key={comment.id}
                  comment={comment}
                  postId={post.id}
                  onUpdate={handleUpdateComment}
                  onDelete={handleDeleteComment}
                  currentUserId={currentUserId}
                />
              ))}
            </div>
          ) : (
            <div className="p-8 text-center text-slate-400 text-sm">
              No comments yet. Be the first to comment!
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// Main Chatter Feed Component
const ChatterFeed = ({ recordId, recordType, currentUserId }) => {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [filter, setFilter] = useState('ALL');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [totalPosts, setTotalPosts] = useState(0);

  const loadPosts = useCallback(async (pageNum = 1, append = false) => {
    try {
      if (pageNum === 1) setLoading(true);
      else setLoadingMore(true);
      
      const result = await chatterService.getFeed({
        recordId,
        recordType,
        filter,
        page: pageNum,
        pageSize: 20
      });
      
      if (append) {
        setPosts(prev => [...prev, ...result.posts]);
      } else {
        setPosts(result.posts);
      }
      
      setTotalPosts(result.total);
      setHasMore(result.has_more);
      setPage(pageNum);
    } catch (err) {
      toast.error('Failed to load feed');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [recordId, recordType, filter]);

  useEffect(() => {
    loadPosts(1);
  }, [loadPosts]);

  const handleCreatePost = async (postData) => {
    try {
      const newPost = await chatterService.createPost({
        ...postData,
        record_id: recordId,
        record_type: recordType
      });
      setPosts(prev => [newPost, ...prev]);
      setTotalPosts(prev => prev + 1);
      toast.success('Post created');
    } catch (err) {
      toast.error('Failed to create post');
    }
  };

  const handleUpdatePost = async (postId, updateData) => {
    try {
      const updated = await chatterService.updatePost(postId, updateData);
      setPosts(prev => prev.map(p => p.id === postId ? updated : p));
      toast.success('Post updated');
    } catch (err) {
      throw err;
    }
  };

  const handleDeletePost = async (postId) => {
    if (!window.confirm('Delete this post?')) return;
    try {
      await chatterService.deletePost(postId);
      setPosts(prev => prev.filter(p => p.id !== postId));
      setTotalPosts(prev => prev - 1);
      toast.success('Post deleted');
    } catch (err) {
      toast.error('Failed to delete post');
    }
  };

  const loadMore = () => {
    if (!loadingMore && hasMore) {
      loadPosts(page + 1, true);
    }
  };

  return (
    <div className="space-y-4" data-testid="chatter-feed">
      {/* Create Post */}
      <div className="bg-white rounded-lg border shadow-sm">
        <div className="p-4 border-b">
          <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
            <MessageCircle className="h-4 w-4" />
            Share an Update
          </h3>
        </div>
        <div className="p-4">
          <RichTextEditor 
            onSubmit={handleCreatePost}
            placeholder="What's on your mind? Use @ to mention someone..."
          />
        </div>
      </div>
      
      {/* Feed Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-slate-700">
            {totalPosts} {totalPosts === 1 ? 'Post' : 'Posts'}
          </span>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-2">
              <Filter className="h-4 w-4" />
              {filter === 'ALL' ? 'All Activity' : filter === 'MY_ACTIVITY' ? 'My Activity' : 'Mentions'}
              <ChevronDown className="h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setFilter('ALL')}>
              All Activity
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setFilter('MY_ACTIVITY')}>
              My Activity
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setFilter('MENTIONS')}>
              Mentions
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      
      {/* Posts List */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
        </div>
      ) : posts.length > 0 ? (
        <div className="space-y-4">
          {posts.map(post => (
            <PostCard 
              key={post.id}
              post={post}
              onUpdate={handleUpdatePost}
              onDelete={handleDeletePost}
              currentUserId={currentUserId}
            />
          ))}
          
          {hasMore && (
            <div className="text-center pt-4">
              <Button 
                variant="outline" 
                onClick={loadMore}
                disabled={loadingMore}
              >
                {loadingMore ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Loading...
                  </>
                ) : (
                  'Load More'
                )}
              </Button>
            </div>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-lg border p-12 text-center">
          <MessageCircle className="h-12 w-12 mx-auto text-slate-300 mb-3" />
          <h3 className="text-lg font-medium text-slate-700 mb-1">No posts yet</h3>
          <p className="text-sm text-slate-500">Be the first to share an update!</p>
        </div>
      )}
    </div>
  );
};

export default ChatterFeed;
