/**
 * ListViewLoadingState - Loading spinner display
 */
import React from 'react';

const ListViewLoadingState = ({ objectPlural }) => {
  return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      <p className="ml-3 text-slate-600">Loading {objectPlural.toLowerCase()}...</p>
    </div>
  );
};

export default ListViewLoadingState;
