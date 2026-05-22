import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

interface ExportOptions {
  fileName?: string;
  scale?: number;
  pixelRatio?: number;
  title?: string;
}

/**
 * Export map as high-quality PNG image
 */
export const exportMapAsImage = async (
  containerRef: React.RefObject<HTMLDivElement>,
  options: ExportOptions = {}
) => {
  const {
    fileName = 'mapa_empreendimento',
    scale = 4,
    pixelRatio = 2,
  } = options;

  if (!containerRef.current) {
    throw new Error('Container not found');
  }

  try {
    const canvas = await html2canvas(containerRef.current, {
      scale: pixelRatio,
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff',
      allowTaint: true,
    });

    // Create download link
    const link = document.createElement('a');
    link.href = canvas.toDataURL('image/png');
    link.download = `${fileName}_${new Date().toISOString().split('T')[0]}.png`;
    link.click();
  } catch (error) {
    console.error('Error exporting image:', error);
    throw new Error('Failed to export image');
  }
};

/**
 * Export map as high-quality PDF document
 */
export const exportMapAsPDF = async (
  containerRef: React.RefObject<HTMLDivElement>,
  options: ExportOptions = {}
) => {
  const {
    fileName = 'mapa_empreendimento',
    title = 'Mapa do Empreendimento',
    scale = 4,
    pixelRatio = 2,
  } = options;

  if (!containerRef.current) {
    throw new Error('Container not found');
  }

  try {
    const canvas = await html2canvas(containerRef.current, {
      scale: pixelRatio,
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff',
      allowTaint: true,
    });

    const imgData = canvas.toDataURL('image/png');
    const imgWidth = 280; // A4 width in mm (landscape)
    const imgHeight = (canvas.height * imgWidth) / canvas.width;

    const pdf = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: 'a4',
    });

    // Add title
    const pageHeight = pdf.internal.pageSize.getHeight();
    const pageWidth = pdf.internal.pageSize.getWidth();

    pdf.setFontSize(16);
    pdf.text(title, pageWidth / 2, 15, { align: 'center' });

    // Add image
    pdf.addImage(imgData, 'PNG', 15, 25, imgWidth, imgHeight);

    // Add footer with date
    const footer = `Exportado em: ${new Date().toLocaleDateString('pt-BR')}`;
    pdf.setFontSize(10);
    pdf.text(footer, pageWidth / 2, pageHeight - 10, { align: 'center' });

    // Download
    pdf.save(`${fileName}_${new Date().toISOString().split('T')[0]}.pdf`);
  } catch (error) {
    console.error('Error exporting PDF:', error);
    throw new Error('Failed to export PDF');
  }
};

/**
 * Export map at higher resolution (4x)
 */
export const exportMapHighResolution = async (
  containerRef: React.RefObject<HTMLDivElement>,
  options: ExportOptions = {}
) => {
  return exportMapAsImage(containerRef, {
    ...options,
    scale: 4,
    pixelRatio: 2,
  });
};
