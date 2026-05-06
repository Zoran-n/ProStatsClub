import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SidebarNav } from '../SidebarNav';

// Mock the Zustand store — SidebarNav reads sidebarTab, setSidebarTab, eaProfile
vi.mock('../../../store/useAppStore', () => ({
  useAppStore: vi.fn(() => ({
    sidebarTab: 'search',
    setSidebarTab: vi.fn(),
    eaProfile: null,
  })),
}));

describe('SidebarNav', () => {
  it('affiche les 3 onglets de base', () => {
    render(<SidebarNav />);
    expect(screen.getByText('CHERCHE')).toBeInTheDocument();
    expect(screen.getByText('FAVORIS')).toBeInTheDocument();
    expect(screen.getByText('PARAMS')).toBeInTheDocument();
  });

  it("n'affiche pas PROFIL quand eaProfile est null", () => {
    render(<SidebarNav />);
    expect(screen.queryByText('PROFIL')).not.toBeInTheDocument();
  });

  it('appelle setSidebarTab au clic sur un onglet', async () => {
    const setSidebarTab = vi.fn();
    const { useAppStore } = await import('../../../store/useAppStore');
    vi.mocked(useAppStore).mockReturnValue({
      sidebarTab: 'search',
      setSidebarTab,
      eaProfile: null,
    } as ReturnType<typeof useAppStore>);

    render(<SidebarNav />);
    fireEvent.click(screen.getByText('FAVORIS'));
    expect(setSidebarTab).toHaveBeenCalledWith('favs');
  });
});
