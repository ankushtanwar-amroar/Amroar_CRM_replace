/**
 * Admin Authentication Context
 * Completely isolated from CRM auth
 */
import React, { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const ADMIN_API = `${BACKEND_URL}/api/admin`;

const AdminAuthContext = createContext(null);

export const AdminAuthProvider = ({ children }) => {
  const [adminUser, setAdminUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check for existing admin token
    const token = localStorage.getItem('admin_token');
    if (token) {
      verifyAdminToken(token);
    } else {
      setLoading(false);
    }
  }, []);

  const verifyAdminToken = async (token) => {
    try {
      const response = await axios.get(`${ADMIN_API}/me`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setAdminUser(response.data);
    } catch (error) {
      console.error('Admin token verification failed:', error);
      localStorage.removeItem('admin_token');
      setAdminUser(null);
    } finally {
      setLoading(false);
    }
  };

  const adminLogin = async (email, password) => {
    try {
      const response = await axios.post(`${ADMIN_API}/login`, {
        email,
        password
      });
      
      const { access_token, user } = response.data;
      
      localStorage.setItem('admin_token', access_token);
      setAdminUser(user);
      
      return { success: true, user };
    } catch (error) {
      const message = error.response?.data?.detail || 'Admin login failed';
      return { success: false, error: message };
    }
  };

  const adminLogout = () => {
    localStorage.removeItem('admin_token');
    setAdminUser(null);
  };

  const getAdminToken = () => {
    return localStorage.getItem('admin_token');
  };

  return (
    <AdminAuthContext.Provider value={{
      adminUser,
      loading,
      adminLogin,
      adminLogout,
      getAdminToken,
      isAuthenticated: !!adminUser
    }}>
      {children}
    </AdminAuthContext.Provider>
  );
};

export const useAdminAuth = () => {
  const context = useContext(AdminAuthContext);
  if (!context) {
    throw new Error('useAdminAuth must be used within AdminAuthProvider');
  }
  return context;
};

export default AdminAuthContext;
