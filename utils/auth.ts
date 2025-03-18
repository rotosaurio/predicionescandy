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
  // Admin can access all sucursales
  if (user.role === 'admin') return true;
  
  // Advanced users can view all sucursales
  if (user.role === 'advanced') return true;
  
  // Normal users can only access their assigned sucursal
  if (user.role === 'normal' && user.sucursal === sucursalName) return true;
  
  return false;
}

export function canAccessAdvancedPanel(user: User): boolean {
  return user.role === 'advanced' || user.role === 'admin';
}

export function canAccessAdminPanel(user: User): boolean {
  // Only admin can access admin panels
  return user.role === 'admin';
}

// Add a new function to check if a user can access a specific path
export function canAccessPath(user: User, pathname: string): boolean {
  // Allow all users to access authentication pages
  if (pathname === '/login' || pathname === '/logout') return true;
  
  // Admin can access everything
  if (user.role === 'admin') return true;
  
  // Advanced users can only access advanced panel and branch pages
  if (user.role === 'advanced') {
    return pathname === '/enrique' || 
           pathname.startsWith('/enrique/') ||
           pathname.startsWith('/sucursal/') ||
           pathname === '/';
  }
  
  // Normal users can access their branch and the home page
  if (user.role === 'normal') {
    // They can access their assigned sucursal page
    if (user.sucursal && pathname === `/sucursal/${encodeURIComponent(user.sucursal)}`) return true;
    // They can access the home page
    if (pathname === '/') return true;
  }
  
  return false;
}

export function checkUserAccess(user: Partial<User> | null, pathname: string): { authorized: boolean; redirectTo?: string } {
  // If not logged in, redirect to login
  if (!user || !user.username || !user.role) {
    return { authorized: false, redirectTo: '/login' };
  }
  
  // If admin, always allow
  if (user.role === 'admin') {
    return { authorized: true };
  }
  
  // Check specific paths for advanced users
  if (user.role === 'advanced') {
    if (pathname.startsWith('/admin') || 
        pathname === '/recomendaciones' || 
        pathname === '/debug') {
      return { authorized: false, redirectTo: '/enrique' };
    }
    
    // Allow access to advanced panel and sucursal pages
    if (pathname.startsWith('/enrique') || 
        pathname.startsWith('/sucursal/') || 
        pathname === '/') {
      return { authorized: true };
    }
    
    // Default redirect for advanced users
    return { authorized: false, redirectTo: '/enrique' };
  }
  
  // Normal users logic
  if (user.role === 'normal') {
    // Redirect to their assigned branch if they have one and we're at home page
    if (pathname === '/' && user.sucursal) {
      // Make sure sucursal is defined and not empty before creating the redirect URL
      const sucursalParam = user.sucursal.trim();
      if (sucursalParam) {
        return { authorized: false, redirectTo: `/sucursal/${encodeURIComponent(sucursalParam)}` };
      }
    }
    
    // Check if they can access the current page
    if (canAccessPath(user as User, pathname)) {
      return { authorized: true };
    }
    
    // Default redirect for normal users - ensure sucursal is valid
    if (user.sucursal && user.sucursal.trim()) {
      return { authorized: false, redirectTo: `/sucursal/${encodeURIComponent(user.sucursal.trim())}` };
    } else {
      // Fallback to home if no valid sucursal
      return { authorized: false, redirectTo: '/' };
    }
  }
  
  // Default - unauthorized
  return { authorized: false, redirectTo: '/login' };
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