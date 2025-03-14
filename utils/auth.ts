export type UserRole = 'normal' | 'advanced' | 'admin';

export type User = {
  username: string;
  password: string;
  role: UserRole;
  sucursal?: string; // Nombre de la sucursal para usuarios normales
  sucursalId?: number; // ID numérico de la sucursal
};

// In-memory authentication state (will be lost on page refresh)
let currentUser: Partial<User> | null = null;

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

export const users: User[] = [
  // Usuarios Normales - Sucursal 1: TECNOLOGICO
  {
    username: 'sucursal1_user1',
    password: 'S1User2024!',
    role: 'normal',
    sucursal: "TECNOLOGICO",
    sucursalId: 1
  },
  {
    username: 'sucursal1_user2',
    password: 'S1Staff2024!',
    role: 'normal',
    sucursal: "TECNOLOGICO",
    sucursalId: 1
  },
  
  // Usuarios Normales - Sucursal 2: KRAMFORS - WASHINGTON
  {
    username: 'sucursal2_user1',
    password: 'S2User2024!',
    role: 'normal',
    sucursal: "KRAMFORS - WASHINGTON",
    sucursalId: 2
  },
  {
    username: 'sucursal2_user2',
    password: 'S2Staff2024!',
    role: 'normal',
    sucursal: "KRAMFORS - WASHINGTON",
    sucursalId: 2
  },

  // Usuarios Normales - Sucursal 3: KRAMFORS - SAN PEDRO
  {
    username: 'sucursal3_user1',
    password: 'S3User2024!',
    role: 'normal',
    sucursal: "KRAMFORS - SAN PEDRO",
    sucursalId: 3
  },
  {
    username: 'sucursal3_user2',
    password: 'S3Staff2024!',
    role: 'normal',
    sucursal: "KRAMFORS - SAN PEDRO",
    sucursalId: 3
  },

  // Usuarios Normales - Sucursal 4: INDUSTRIAL - MIRADOR
  {
    username: 'sucursal4_user1',
    password: 'S4User2024!',
    role: 'normal',
    sucursal: "INDUSTRIAL - MIRADOR",
    sucursalId: 4
  },
  {
    username: 'sucursal4_user2',
    password: 'S4Staff2024!',
    role: 'normal',
    sucursal: "INDUSTRIAL - MIRADOR",
    sucursalId: 4
  },

  // Usuarios Normales - Sucursal 5: ENEDINA - NUEVA ESPAÑA
  {
    username: 'sucursal5_user1',
    password: 'S5User2024!',
    role: 'normal',
    sucursal: "ENEDINA - NUEVA ESPAÑA",
    sucursalId: 5
  },
  {
    username: 'sucursal5_user2',
    password: 'S5Staff2024!',
    role: 'normal',
    sucursal: "ENEDINA - NUEVA ESPAÑA",
    sucursalId: 5
  },

  // Usuarios Normales - Sucursal 6: ENEDINA - INDUSTRIAS
  {
    username: 'sucursal6_user1',
    password: 'S6User2024!',
    role: 'normal',
    sucursal: "ENEDINA - INDUSTRIAS",
    sucursalId: 6
  },
  {
    username: 'sucursal6_user2',
    password: 'S6Staff2024!',
    role: 'normal',
    sucursal: "ENEDINA - INDUSTRIAS",
    sucursalId: 6
  },

  // Usuarios Normales - Sucursal 7: CENTRO
  {
    username: 'sucursal7_user1',
    password: 'S7User2024!',
    role: 'normal',
    sucursal: "CENTRO",
    sucursalId: 7
  },
  {
    username: 'sucursal7_user2',
    password: 'S7Staff2024!',
    role: 'normal',
    sucursal: "CENTRO",
    sucursalId: 7
  },

  // Usuario Avanzado
  {
    username: 'advanced_user',
    password: 'AdvPanel2024!',
    role: 'advanced'
  },

  // Usuario Administrador
  {
    username: 'admin_user',
    password: 'AdminTotal2024!',
    role: 'admin'
  }
];

export function authenticateUser(username: string, password: string): User | null {
  return users.find(user => 
    user.username === username && user.password === password
  ) || null;
}

export function getUserSucursal(user: User): string | null {
  return user.sucursal || null;
}

export function canAccessSucursal(user: User, sucursalName: string): boolean {
  if (user.role === 'admin') return true;
  if (user.role === 'normal' && user.sucursal === sucursalName) return true;
  return false;
}

export function canAccessAdvancedPanel(user: User): boolean {
  return user.role === 'advanced' || user.role === 'admin';
}

export function canAccessAdminPanel(user: User): boolean {
  return user.role === 'admin';
}

// Session management - now using in-memory state that won't persist on refresh
export function setCurrentUser(user: User): void {
  // Store minimal user info for security
  currentUser = {
    username: user.username,
    role: user.role,
    sucursal: user.sucursal,
    sucursalId: user.sucursalId
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

// Route protection helpers
export function isRouteAuthorized(user: Partial<User> | null, pathname: string): boolean {
  if (!user) return false;
  
  // Public routes that don't require authentication
  const publicRoutes = ['/login'];
  if (publicRoutes.includes(pathname)) return true;
  
  // Check specific route permissions
  if (pathname.startsWith('/admin') && user.role !== 'admin') {
    return false;
  }
  
  if (pathname.startsWith('/enrique') && !['admin', 'advanced'].includes(user.role as string)) {
    return false;
  }
  
  // Handle dynamic sucursal routes properly
  if (pathname.startsWith('/sucursal/')) {
    const pathParts = pathname.split('/');
    if (pathParts.length >= 3 && pathParts[2]) {
      const sucursalPath = decodeURIComponent(pathParts[2]);
      
      // If it's a number (legacy format), check by ID
      if (!isNaN(parseInt(sucursalPath))) {
        const sucursalId = parseInt(sucursalPath);
        if (user.role === 'admin') return true;
        if (user.role === 'normal' && user.sucursalId === sucursalId) return true;
        return false;
      }
      
      // Otherwise check by name
      if (user.role === 'admin') return true;
      if (user.role === 'normal' && user.sucursal === sucursalPath) return true;
      return false;
    }
    // If we can't parse the ID or there's no ID, allow access only for admin
    return user.role === 'admin';
  }
  
  return true;
}

// Helper to get sucursal by ID or name
export function getSucursalById(id: number): string | undefined {
  const sucursal = sucursales.find(s => s.id === id);
  return sucursal?.name;
}

export function getSucursalId(name: string): number | undefined {
  const sucursal = sucursales.find(s => s.name === name);
  return sucursal?.id;
}