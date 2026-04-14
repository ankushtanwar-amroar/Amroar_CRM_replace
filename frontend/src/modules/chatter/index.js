/**
 * Chatter Module - Salesforce-like social feed for CRM
 * 
 * Features:
 * - Rich text posts with formatting
 * - @Mention user tagging
 * - Comments with threading
 * - Likes and reactions (👍 ❤️ 🎉 💡 ❓)
 * - File/image attachments
 * - Activity feed filtering
 * - Real-time notifications
 */

export { default as ChatterFeed } from './components/ChatterFeed';
export { default as RichTextEditor } from './components/RichTextEditor';
export { default as chatterService } from './services/chatterService';
