export type UserRole = 'normal' | 'advanced' | 'admin';

export type User = {
  username: string;
  password: string;
  role: UserRole;
  sucursal?: string;
  sucursalId?: number;
};

let currentUser: Partial<User> | null = null;

export async function authenticateUser(username: string, password: string): Promise<User | null> {
  const response = await fetch('/api/authenticate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ username, password }),
  });

  if (!response.ok) {
    return null;
  }

  const user = await response.json();
  return user || null;
}

export function setCurrentUser(user: User): void {
  currentUser = {
    username: user.username,
    role: user.role,
    sucursal: user.sucursal,
    sucursalId: user.sucursalId,
  };
}

export function getCurrentUser(): Partial<User> | null {
  return currentUser;
}

export function clearCurrentUser(): void {
  currentUser = null;
}

export function isUserLoggedIn(): boolean {
  return currentUser !== null;
}

export function getUserSucursal(user: User): string | null {
  return user.sucursal || null;
}

export function canAccessSucursal(user: User, sucursalName: string): boolean {
  if (user.role === 'admin' || user.role === 'advanced') return true;
  if (user.role === 'normal' && user.sucursal === sucursalName) return true;
  return false;
}

export function canAccessAdvancedPanel(user: User): boolean {
  return user.role === 'advanced' || user.role === 'admin';
}

export function canAccessAdminPanel(user: User): boolean {
  return user.role === 'admin';
}

export function isRouteAuthorized(user: Partial<User> | null, pathname: string): boolean {
  if (!user) return false;
  if (pathname.startsWith('/admin') && user.role !== 'admin') {
    return false;
  }
  if (pathname.startsWith('/enrique') && !['admin', 'advanced'].includes(user.role as string)) {
    return false;
  }
  return true;
}

// Definición de sucursales
export const sucursales = [
  { id: 1, name: "TECNOLOGICO" },
  { id: 2, name: "KRAMFORS - WASHINGTON" },
  { id: 3, name: "KRAMFORS - SAN PEDRO" },
  { id: 4, name: "INDUSTRIAL - MIRADOR" },
  { id: 5, name: "ENEDINA - NUEVA ESPAÑA" },
  { id: 6, name: "ENEDINA - INDUSTRIAS" },
  { id: 7, name: "CENTRO" }
];

// Helper to get sucursal by ID or name
export function getSucursalById(id: number): string | undefined {
  const sucursal = sucursales.find(s => s.id === id);
  return sucursal?.name;
}

export function getSucursalId(name: string): number | undefined {
  const sucursal = sucursales.find(s => s.name === name);
  return sucursal?.id;
}