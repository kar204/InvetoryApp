import { AppRole } from '@/types/database';

export type AppRoutePath =
  | '/dashboard'
  | '/services'
  | '/inventory'
  | '/scrap'
  | '/transactions'
  | '/users';

export interface AppRouteAccess {
  path: AppRoutePath;
  title: string;
  roles: AppRole[];
}

export const APP_ROUTE_ACCESS: AppRouteAccess[] = [
  {
    path: '/dashboard',
    title: 'Dashboard',
    roles: ['admin', 'warehouse_staff', 'procurement_staff'],
  },
  {
    path: '/services',
    title: 'Service Tickets',
    roles: ['admin', 'counter_staff', 'service_agent', 'sp_battery', 'sp_invertor'],
  },
  {
    path: '/inventory',
    title: 'Inventory',
    roles: ['admin', 'warehouse_staff', 'procurement_staff'],
  },
  {
    path: '/scrap',
    title: 'Scrap',
    roles: ['admin', 'scrap_manager'],
  },
  {
    path: '/transactions',
    title: 'Transactions',
    roles: ['admin', 'warehouse_staff', 'procurement_staff'],
  },
  {
    path: '/users',
    title: 'Users',
    roles: ['admin'],
  },
];

export const getRouteRoles = (path: AppRoutePath): AppRole[] =>
  APP_ROUTE_ACCESS.find((route) => route.path === path)?.roles ?? [];

export const getAllowedRoutes = (roles: AppRole[]) =>
  APP_ROUTE_ACCESS.filter((route) => route.roles.some((role) => roles.includes(role)));

export const canAccessPath = (roles: AppRole[], path: string) => {
  const route = APP_ROUTE_ACCESS.find((item) => item.path === path);
  if (!route) {
    return true;
  }
  return route.roles.some((role) => roles.includes(role));
};

export const getDefaultPathForRoles = (roles: AppRole[]) =>
  getAllowedRoutes(roles)[0]?.path ?? '/no-access';
