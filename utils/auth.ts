export type UserRole = 'normal' | 'advanced' | 'admin';

export type User = {
  username: string;
  password: string;
  role: UserRole;
  sucursal?: string;
  sucursalId?: number;
};

let currentUser: Partial<User> | null = null;

// Improve session persistence by caching the user object
let cachedUser: User | null = null;

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
  if (typeof window === 'undefined') return;
  
  try {
    cachedUser = user;
    sessionStorage.setItem('user', JSON.stringify(user));
  } catch (e) {
    console.error('Error setting current user:', e);
  }
}

export function getCurrentUser(): User | null {
  if (typeof window === 'undefined') return null;
  
  try {
    // Return cached user if available
    if (cachedUser) return cachedUser;
    
    const userJson = sessionStorage.getItem('user');
    if (!userJson) return null;
    
    const user = JSON.parse(userJson);
    cachedUser = user;
    return user;
  } catch (e) {
    console.error('Error getting current user:', e);
    return null;
  }
}

export function clearCurrentUser(): void {
  if (typeof window === 'undefined') return;
  
  try {
    cachedUser = null;
    sessionStorage.removeItem('user');
  } catch (e) {
    console.error('Error clearing current user:', e);
  }
}

export function isUserLoggedIn(): boolean {
  if (typeof window === 'undefined') return false;
  
  try {
    // First check cached user
    if (cachedUser) return true;
    
    // Then check session storage
    const userJson = sessionStorage.getItem('user');
    if (!userJson) return false;
    
    // Parse and cache the user object
    const user = JSON.parse(userJson);
    cachedUser = user;
    return !!user;
  } catch (e) {
    console.error('Error checking login status:', e);
    return false;
  }
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

// Función para verificar si un usuario puede acceder a una ruta específica
export function canUserAccessRoute(user: User, path: string): boolean {
  // Eliminar parámetros de consulta para la comparación de rutas
  const cleanPath = path.split('?')[0];
  
  // Administradores pueden acceder a todas las rutas
  if (user.role === 'admin') return true;
  
  // Advanced users can only access advanced panel, branch pages, and prediction details
  if (user.role === 'advanced') {
    // Allow access to advanced panel
    if (cleanPath === '/enrique') return true;
    
    // Allow access to branch pages
    if (cleanPath.startsWith('/sucursal/')) return true;
    
    // Allow access to prediction details page
    if (cleanPath === '/predictions/details') return true;
    
    // Deny access to other routes
    return false;
  }
  
  // Normal users can only access their assigned branch
  if (user.role === 'normal') {
    // They can access their assigned sucursal page
    if (user.sucursal && cleanPath === `/sucursal/${encodeURIComponent(user.sucursal)}`) return true;
    // They can access the home page
    if (cleanPath === '/') return true;
  }
  
  return false;
}

// Add a new function to check if a user can access a specific path
export function canAccessPath(user: User, pathname: string): boolean {
  // Allow all users to access authentication pages
  if (pathname === '/login' || pathname === '/logout') return true;
  
  // Admin can access everything
  if (user.role === 'admin') return true;
  
  // Advanced users can only access advanced panel, branch pages, and prediction details
  if (user.role === 'advanced') {
    return pathname === '/enrique' || 
           pathname.startsWith('/enrique/') ||
           pathname.startsWith('/sucursal/') ||
           pathname.startsWith('/predictions/details') ||
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
    // If at the root page, redirect to advanced panel
    if (pathname === '/') {
      return { authorized: false, redirectTo: '/enrique' };
    }
    
    // Block access to admin and other restricted areas
    if (pathname.startsWith('/admin') || 
        pathname === '/recomendaciones' || 
        pathname === '/debug') {
      return { authorized: false, redirectTo: '/enrique' };
    }
    
    // Allow access to advanced panel, prediction details and sucursal pages
    if (pathname.startsWith('/enrique') || 
        pathname.startsWith('/sucursal/') ||
        pathname.startsWith('/predictions/details')) {
      return { authorized: true };
    }
    
    // Default redirect for advanced users - always to advanced panel
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