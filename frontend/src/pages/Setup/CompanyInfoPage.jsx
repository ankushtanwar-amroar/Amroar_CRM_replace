import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
  Building2,
  User,
  CreditCard,
  Globe,
  Calendar,
  Mail,
  Layers,
  Shield,
  Sparkles,
  KeyRound,
} from 'lucide-react';
import { Badge } from '../../components/ui/badge';

const API = process.env.REACT_APP_BACKEND_URL;

const getPlanConfig = (plan) => {
  const type = (plan?.type || 'free').toLowerCase();
  if (type === 'enterprise')
    return { label: 'Enterprise', gradient: 'from-violet-500 to-indigo-600', bg: 'bg-violet-50', text: 'text-violet-700', border: 'border-violet-200' };
  if (type === 'professional')
    return { label: 'Professional', gradient: 'from-blue-500 to-cyan-500', bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' };
  if (type === 'starter')
    return { label: 'Starter', gradient: 'from-emerald-500 to-teal-500', bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' };
  if (type === 'trial')
    return { label: 'Trial', gradient: 'from-amber-500 to-orange-500', bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' };
  if (type === 'docflow_only')
    return { label: 'DocFlow Only', gradient: 'from-indigo-500 to-purple-500', bg: 'bg-indigo-50', text: 'text-indigo-700', border: 'border-indigo-200' };
  return { label: 'Free', gradient: 'from-slate-400 to-slate-500', bg: 'bg-slate-50', text: 'text-slate-600', border: 'border-slate-200' };
};

const InfoItem = ({ label, value, icon: Icon }) => (
  <div className="flex items-center gap-3 py-3">
    <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-slate-50 border border-slate-100 flex-shrink-0">
      {Icon && <Icon className="h-4 w-4 text-slate-400" />}
    </div>
    <div className="flex-1 min-w-0">
      <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">{label}</p>
      <p className="text-sm font-semibold text-slate-800 truncate mt-0.5" title={value || '—'}>
        {value || '—'}
      </p>
    </div>
  </div>
);

const CompanyInfoPage = () => {
  const [info, setInfo] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const token = localStorage.getItem('token');
        const { data } = await axios.get(`${API}/api/runtime/company-info`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setInfo(data);
      } catch (err) {
        console.error('Failed to load company info:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64" data-testid="company-info-loading">
        <div className="flex flex-col items-center gap-3">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-indigo-200 border-t-indigo-600" />
          <p className="text-sm text-slate-400">Loading company info...</p>
        </div>
      </div>
    );
  }

  if (!info) {
    return (
      <div className="p-8 text-center text-slate-500" data-testid="company-info-error">
        <Building2 className="h-12 w-12 mx-auto mb-3 text-slate-300" />
        <p className="font-medium">Unable to load company information.</p>
      </div>
    );
  }

  const planConfig = getPlanConfig(info.plan);
  const createdDate = info.organization?.created_at
    ? new Date(info.organization.created_at).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : null;

  const statusActive = (info.plan?.status || 'active').toLowerCase() === 'active';
  const licenses = info.licenses || [];

  return (
    <div className="max-w-5xl" data-testid="company-info-page">
      {/* Page Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-1">
          <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-600 shadow-md shadow-indigo-200">
            <Building2 className="h-5 w-5 text-white" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-slate-800 tracking-tight" data-testid="company-info-title">
              Company Information
            </h2>
            <p className="text-sm text-slate-500">View organization details, admin info, and plan</p>
          </div>
        </div>
      </div>

      {/* Cards Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Organization Details */}
        <div
          className="group bg-white rounded-2xl border border-slate-200/80 shadow-sm hover:shadow-md transition-all duration-300 overflow-hidden"
          data-testid="organization-card"
        >
          <div className="px-6 pt-5 pb-4 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-sky-400 to-blue-500 shadow-sm">
                <Building2 className="h-5 w-5 text-white" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-slate-800">Organization Details</h2>
                <p className="text-xs text-slate-400">Workspace configuration</p>
              </div>
            </div>
          </div>
          <div className="px-6 py-2 divide-y divide-slate-50">
            <InfoItem label="Company Name" value={info.organization?.name} icon={Building2} />
            <InfoItem
              label="Industry"
              value={
                info.organization?.industry
                  ? info.organization.industry.charAt(0).toUpperCase() + info.organization.industry.slice(1)
                  : null
              }
              icon={Globe}
            />
            <InfoItem label="Created" value={createdDate} icon={Calendar} />
          </div>
        </div>

        {/* Admin Information */}
        <div
          className="group bg-white rounded-2xl border border-slate-200/80 shadow-sm hover:shadow-md transition-all duration-300 overflow-hidden"
          data-testid="admin-info-card"
        >
          <div className="px-6 pt-5 pb-4 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 shadow-sm">
                <User className="h-5 w-5 text-white" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-slate-800">Admin Information</h2>
                <p className="text-xs text-slate-400">Primary administrator</p>
              </div>
            </div>
          </div>
          <div className="px-6 py-2 divide-y divide-slate-50">
            <InfoItem label="Admin Name" value={info.admin?.name} icon={User} />
            <InfoItem label="Admin Email" value={info.admin?.email} icon={Mail} />
          </div>
        </div>

        {/* Plan Information */}
        <div
          className="bg-white rounded-2xl border border-slate-200/80 shadow-sm hover:shadow-md transition-all duration-300 overflow-hidden"
          data-testid="plan-info-card"
        >
          <div className="px-6 pt-5 pb-4 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white">
            <div className="flex items-center gap-3">
              <div className={`flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br ${planConfig.gradient} shadow-sm`}>
                <CreditCard className="h-5 w-5 text-white" />
              </div>
              <div className="flex-1">
                <h2 className="text-base font-semibold text-slate-800">Plan Information</h2>
                <p className="text-xs text-slate-400">Subscription and billing</p>
              </div>
              <Badge
                className={`${statusActive ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200'} px-3 py-1 text-xs font-semibold`}
                variant="outline"
                data-testid="plan-status-badge"
              >
                <span className={`inline-block w-1.5 h-1.5 rounded-full mr-1.5 ${statusActive ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                {statusActive ? 'Active' : info.plan?.status || 'Inactive'}
              </Badge>
            </div>
          </div>
          <div className="px-6 py-2 divide-y divide-slate-50">
            <div className="flex items-center gap-3 py-3" data-testid="current-plan-item">
              <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-slate-50 border border-slate-100 flex-shrink-0">
                <Sparkles className="h-4 w-4 text-slate-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">Current Plan</p>
                <div className="mt-1">
                  <Badge className={`${planConfig.bg} ${planConfig.text} ${planConfig.border} font-semibold text-xs px-2.5 py-0.5`} variant="outline">
                    {info.plan?.name || planConfig.label}
                  </Badge>
                </div>
              </div>
            </div>
            <InfoItem label="Plan Type" value={(info.plan?.type || 'free').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())} icon={Layers} />
            <div className="flex items-center gap-3 py-3" data-testid="plan-status-item">
              <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-slate-50 border border-slate-100 flex-shrink-0">
                <Shield className="h-4 w-4 text-slate-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">Status</p>
                <p className={`text-sm font-semibold mt-0.5 ${statusActive ? 'text-emerald-600' : 'text-amber-600'}`}>
                  {statusActive ? 'Active' : info.plan?.status || 'Inactive'}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* License Information */}
        <div
          className="bg-white rounded-2xl border border-slate-200/80 shadow-sm hover:shadow-md transition-all duration-300 overflow-hidden"
          data-testid="license-info-card"
        >
          <div className="px-6 pt-5 pb-4 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-teal-400 to-emerald-500 shadow-sm">
                <KeyRound className="h-5 w-5 text-white" />
              </div>
              <div className="flex-1">
                <h2 className="text-base font-semibold text-slate-800">License Information</h2>
                <p className="text-xs text-slate-400">Assigned licenses and seats</p>
              </div>
              {licenses.length > 0 && (
                <Badge variant="outline" className="bg-slate-50 text-slate-600 border-slate-200 text-xs font-semibold">
                  {licenses.length} {licenses.length === 1 ? 'license' : 'licenses'}
                </Badge>
              )}
            </div>
          </div>
          <div className="px-6 py-3">
            {licenses.length === 0 ? (
              <div className="py-6 text-center">
                <KeyRound className="h-8 w-8 text-slate-200 mx-auto mb-2" />
                <p className="text-sm text-slate-400">No licenses assigned</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-50">
                {licenses.map((lic, idx) => (
                  <div key={idx} className="flex items-center gap-3 py-3" data-testid={`license-item-${idx}`}>
                    <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-slate-50 border border-slate-100 flex-shrink-0">
                      <KeyRound className="h-4 w-4 text-slate-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-800">{lic.license_name}</p>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <Badge variant="outline" className="text-[10px] bg-blue-50 text-blue-600 border-blue-200 capitalize">
                          {(lic.module_key || '').replace(/_/g, ' ')}
                        </Badge>
                        <Badge variant="outline" className="text-[10px] bg-slate-50 text-slate-500 border-slate-200 capitalize">
                          {(lic.assignment_type || '').replace(/_/g, ' ')}
                        </Badge>
                        {lic.seats > 0 && (
                          <span className="text-[10px] text-slate-400">{lic.seats} seats</span>
                        )}
                      </div>
                    </div>
                    <Badge
                      variant="outline"
                      className={`text-[10px] ${lic.status === 'active' ? 'bg-emerald-50 text-emerald-600 border-emerald-200' : 'bg-amber-50 text-amber-600 border-amber-200'}`}
                    >
                      {lic.status}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default CompanyInfoPage;
