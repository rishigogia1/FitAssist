// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AppSidebar } from './AppSidebar';
import React from 'react';

// Mock the hooks
const mockNavigate = vi.fn();
const mockLogout = vi.fn();

vi.mock('@tanstack/react-router', () => ({
  useRouterState: () => ({ location: { pathname: '/dashboard' } }),
  useNavigate: () => mockNavigate,
  Link: ({ children, to, className }: any) => <a href={to} className={className}>{children}</a>
}));

vi.mock('@/lib/auth-context', () => ({
  useAuth: () => ({ logout: mockLogout })
}));

describe('AppSidebar', () => {
  it('navigates to /pro when Upgrade button is clicked', () => {
    render(<AppSidebar />);
    
    const upgradeButton = screen.getByText('Upgrade');
    expect(upgradeButton).toBeTruthy();
    
    fireEvent.click(upgradeButton);
    
    expect(mockNavigate).toHaveBeenCalledWith({ to: '/pro' });
  });
});
