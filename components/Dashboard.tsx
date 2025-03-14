import React, { useState, useEffect } from 'react';
import type { IconType } from 'react-icons';

// Intentar importar los iconos, pero usar fallbacks si fallan
let FiBarChart2: IconType;
let FiTrendingUp: IconType;
let FiCheckCircle: IconType;
let FiClock: IconType;
let FiBox: IconType;
let FiDatabase: IconType;

try {
  const icons = require('react-icons/fi');
  FiBarChart2 = icons.FiBarChart2;
  FiTrendingUp = icons.FiTrendingUp;
  FiCheckCircle = icons.FiCheckCircle;
  FiClock = icons.FiClock;
  FiBox = icons.FiBox;
  FiDatabase = icons.FiDatabase;
} catch (e) {
  // Simple fallback component if react-icons is not available
  const IconFallback: IconType = ({ children }: { children?: React.ReactNode }) => 
    <span className="inline-block w-5 h-5 bg-gray-300 rounded-sm mr-1">{children}</span>;
  
  FiBarChart2 = IconFallback;
  FiTrendingUp = IconFallback;
  FiCheckCircle = IconFallback;
  FiClock = IconFallback;
  FiBox = IconFallback;
  FiDatabase = IconFallback;
  
  console.warn('react-icons package is not installed. Using fallback icons.');
}

interface DashboardProps {
  stats: {
    totalPredictions: number;
    totalRecommendations: number;
    avgConfidence: number;
    lastUpdated: string;
  };
}

export const Dashboard: React.FC<DashboardProps> = ({ stats }) => {
  return (
    <section className="mb-6">
      <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
        {FiBarChart2 && <FiBarChart2 />} Dashboard Overview
      </h2>
      
      <div className="dashboard-grid">
        <div className="stat-card">
          <div className="flex justify-between items-start">
            <span className="stat-label">Total Predictions</span>
            {FiDatabase && <FiDatabase className="text-blue-500" />}
          </div>
          <div className="stat-value">{stats.totalPredictions}</div>
          <div className="mt-2 text-xs text-gray-500">
            {stats.totalPredictions > 0 ? 'Products ready for inventory' : 'No predictions yet'}
          </div>
        </div>
        
        <div className="stat-card">
          <div className="flex justify-between items-start">
            <span className="stat-label">Recommendations</span>
            {FiTrendingUp && <FiTrendingUp className="text-green-500" />}
          </div>
          <div className="stat-value">{stats.totalRecommendations}</div>
          <div className="mt-2 text-xs text-gray-500">
            {stats.totalRecommendations > 0 ? 'Suggested items' : 'No recommendations yet'}
          </div>
        </div>
        
        <div className="stat-card">
          <div className="flex justify-between items-start">
            <span className="stat-label">Average Confidence</span>
            {FiCheckCircle && <FiCheckCircle className="text-purple-500" />}
          </div>
          <div className="stat-value">
            {stats.avgConfidence ? `${stats.avgConfidence.toFixed(1)}%` : '-'}
          </div>
          <div className="mt-2 text-xs text-gray-500">
            {stats.avgConfidence >= 80 ? 'High reliability' : 
             stats.avgConfidence >= 60 ? 'Moderate reliability' : 
             stats.avgConfidence > 0 ? 'Low reliability' : 'No data'}
          </div>
        </div>
        
        <div className="stat-card">
          <div className="flex justify-between items-start">
            <span className="stat-label">Last Updated</span>
            {FiClock && <FiClock className="text-orange-500" />}
          </div>
          <div className="stat-value text-base">{stats.lastUpdated}</div>
          <div className="mt-2 text-xs text-gray-500">
            {stats.lastUpdated !== '-' ? 'Data is current' : 'No updates yet'}
          </div>
        </div>
      </div>
    </section>
  );
};

export default Dashboard;
