import {
  getDashboardSummary,
  getPendingActions,
  getRecentActivity,
  getSystemHealth,
} from './dashboard.repository';

export async function fetchDashboardSummary() {
  return getDashboardSummary();
}

export async function fetchPendingActions() {
  return getPendingActions();
}

export async function fetchRecentActivity() {
  return getRecentActivity();
}

export async function fetchSystemHealth() {
  return getSystemHealth();
}
