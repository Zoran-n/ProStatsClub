import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ExportModal } from '../ExportModal';

// html2canvas is dynamically imported inside ExportModal — mock it so jsdom doesn't fail
vi.mock('html2canvas', () => ({
  default: vi.fn().mockResolvedValue({ toDataURL: () => 'data:image/png;base64,abc' }),
}));

const CSV_HEADERS = ['Joueur', 'Buts', 'Passes'];
const CSV_ROWS = [
  ['Mbappé', 10, 5],
  ['Griezmann', 7, 12],
];

describe('ExportModal — CSV mode', () => {
  it('affiche le titre EXPORTER — CSV', () => {
    render(
      <ExportModal
        type="csv"
        csvHeaders={CSV_HEADERS}
        csvRows={CSV_ROWS}
        defaultFilename="export-test"
        onClose={vi.fn()}
      />
    );
    expect(screen.getByText(/EXPORTER — CSV/i)).toBeInTheDocument();
  });

  it('le bouton ✕ appelle onClose', () => {
    const onClose = vi.fn();
    render(
      <ExportModal
        type="csv"
        csvHeaders={CSV_HEADERS}
        csvRows={CSV_ROWS}
        defaultFilename="export-test"
        onClose={onClose}
      />
    );
    fireEvent.click(screen.getByText('✕'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('affiche les en-têtes CSV dans le tableau de prévisualisation', () => {
    render(
      <ExportModal
        type="csv"
        csvHeaders={CSV_HEADERS}
        csvRows={CSV_ROWS}
        defaultFilename="export-test"
        onClose={vi.fn()}
      />
    );
    expect(screen.getByText('Joueur')).toBeInTheDocument();
    expect(screen.getByText('Buts')).toBeInTheDocument();
  });

  it('le champ nom de fichier a la valeur par défaut', () => {
    render(
      <ExportModal
        type="csv"
        csvHeaders={CSV_HEADERS}
        csvRows={CSV_ROWS}
        defaultFilename="mon-export"
        onClose={vi.fn()}
      />
    );
    const input = screen.getByDisplayValue('mon-export');
    expect(input).toBeInTheDocument();
  });
});
