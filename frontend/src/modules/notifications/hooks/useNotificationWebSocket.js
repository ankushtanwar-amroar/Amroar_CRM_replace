/**
 * useNotificationWebSocket Hook
 * 
 * Manages WebSocket connection for real-time notification updates
 */

import { useEffect, useRef, useCallback, useState } from 'react';

const API = process.env.REACT_APP_BACKEND_URL || '';
const WS_URL = API.replace('https://', 'wss://').replace('http://', 'ws://');

export function useNotificationWebSocket({ onNotification, onCountUpdate }) {
  const wsRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const [isConnected, setIsConnected] = useState(false);
  
  const connect = useCallback(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      console.log('[NotificationWS] No token, skipping connection');
      return;
    }
    
    try {
      // Close existing connection
      if (wsRef.current) {
        wsRef.current.close();
      }
      
      const wsUrl = `${WS_URL}/api/notifications/ws?token=${token}`;
      console.log('[NotificationWS] Connecting to:', wsUrl);
      
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;
      
      ws.onopen = () => {
        console.log('[NotificationWS] Connected');
        setIsConnected(true);
      };
      
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log('[NotificationWS] Message:', data.type);
          
          switch (data.type) {
            case 'NEW_NOTIFICATION':
              if (onNotification) {
                onNotification(data.payload);
              }
              break;
            case 'UNREAD_COUNT_UPDATE':
            case 'INITIAL_COUNT':
              if (onCountUpdate) {
                onCountUpdate(data.payload.unread_count);
              }
              break;
            default:
              console.log('[NotificationWS] Unknown message type:', data.type);
          }
        } catch (e) {
          console.error('[NotificationWS] Error parsing message:', e);
        }
      };
      
      ws.onclose = (event) => {
        console.log('[NotificationWS] Disconnected:', event.code);
        setIsConnected(false);
        
        // Reconnect after 5 seconds (unless intentionally closed)
        if (event.code !== 1000 && event.code !== 4001 && event.code !== 4002 && event.code !== 4003) {
          reconnectTimeoutRef.current = setTimeout(() => {
            console.log('[NotificationWS] Attempting reconnect...');
            connect();
          }, 5000);
        }
      };
      
      ws.onerror = (error) => {
        console.error('[NotificationWS] Error:', error);
      };
      
    } catch (error) {
      console.error('[NotificationWS] Connection error:', error);
    }
  }, [onNotification, onCountUpdate]);
  
  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
    if (wsRef.current) {
      wsRef.current.close(1000);
      wsRef.current = null;
    }
    setIsConnected(false);
  }, []);
  
  // Send ping to keep connection alive
  const sendPing = useCallback(() => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send('ping');
    }
  }, []);
  
  useEffect(() => {
    connect();
    
    // Setup ping interval
    const pingInterval = setInterval(sendPing, 30000);
    
    return () => {
      clearInterval(pingInterval);
      disconnect();
    };
  }, [connect, disconnect, sendPing]);
  
  return { isConnected, reconnect: connect, disconnect };
}

export default useNotificationWebSocket;
