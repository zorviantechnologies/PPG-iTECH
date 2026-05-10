import Swal from 'sweetalert2';
import * as XLSX from 'xlsx';

const DEFAULT_PRINT_PAGINATION_CSS = `
<style id="global-print-pagination-fix">
    html, body {
        height: auto !important;
        overflow: visible !important;
    }
    table {
        width: 100%;
        border-collapse: collapse;
        table-layout: auto;
    }
    thead { display: table-header-group; }
    tfoot { display: table-footer-group; }
    tr, td, th, img, svg, .print-avoid-break {
        break-inside: avoid;
        page-break-inside: avoid;
    }
    .print-allow-break {
        break-inside: auto;
        page-break-inside: auto;
    }
    @media print {
        html, body {
            height: auto !important;
            overflow: visible !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
        }
        .print-page {
            break-after: page;
            page-break-after: always;
        }
        .print-page:last-child {
            break-after: auto;
            page-break-after: auto;
        }
    }
</style>`;

const withPrintPaginationCss = (html) => {
    const raw = String(html || '');
    if (!raw) return raw;
    if (raw.includes('global-print-pagination-fix')) return raw;

    if (/<head[^>]*>/i.test(raw)) {
        return raw.replace(/<head[^>]*>/i, (match) => `${match}${DEFAULT_PRINT_PAGINATION_CSS}`);
    }

    if (/<html[^>]*>/i.test(raw)) {
        return raw.replace(/<html[^>]*>/i, (match) => `${match}<head>${DEFAULT_PRINT_PAGINATION_CSS}</head>`);
    }

    return `<!doctype html><html><head>${DEFAULT_PRINT_PAGINATION_CSS}</head><body>${raw}</body></html>`;
};

const printWithHiddenIframe = ({ html, title, delay = 250, closeAfterPrint = true }) => {
    return new Promise((resolve) => {
        const iframe = document.createElement('iframe');
        iframe.style.position = 'fixed';
        iframe.style.right = '0';
        iframe.style.bottom = '0';
        iframe.style.width = '0';
        iframe.style.height = '0';
        iframe.style.border = '0';
        iframe.style.visibility = 'hidden';

        iframe.onload = () => {
            const frameWindow = iframe.contentWindow;
            if (!frameWindow) {
                document.body.removeChild(iframe);
                resolve(false);
                return;
            }

            try {
                frameWindow.document.title = title;
            } catch {
                // Ignore title assignment errors.
            }

            setTimeout(() => {
                frameWindow.focus();
                frameWindow.print();
                if (closeAfterPrint) {
                    setTimeout(() => {
                        if (document.body.contains(iframe)) {
                            document.body.removeChild(iframe);
                        }
                    }, 300);
                }
                resolve(true);
            }, delay);
        };

        document.body.appendChild(iframe);
        const doc = iframe.contentDocument || iframe.contentWindow?.document;
        if (!doc) {
            if (document.body.contains(iframe)) {
                document.body.removeChild(iframe);
            }
            resolve(false);
            return;
        }

        doc.open();
        doc.write(withPrintPaginationCss(html));
        doc.close();
    });
};

const waitForDocumentReady = async (doc, timeoutMs = 2000) => {
    const start = Date.now();
    while (doc.readyState !== 'complete' && Date.now() - start < timeoutMs) {
        await new Promise((resolve) => setTimeout(resolve, 50));
    }

    const images = Array.from(doc.images || []);
    await Promise.all(images.map((img) => {
        if (img.complete) return Promise.resolve();
        return new Promise((resolve) => {
            img.addEventListener('load', resolve, { once: true });
            img.addEventListener('error', resolve, { once: true });
            setTimeout(resolve, 1000);
        });
    }));

    if (doc.fonts && doc.fonts.ready) {
        try {
            await Promise.race([
                doc.fonts.ready,
                new Promise((resolve) => setTimeout(resolve, 1000))
            ]);
        } catch {
            // Ignore font readiness failures.
        }
    }
};

const sanitizeFileName = (value, fallback = 'report') => {
    const base = String(value || fallback)
        .trim()
        .replace(/[\\/:*?"<>|]+/g, '-')
        .replace(/\s+/g, ' ')
        .slice(0, 80);
    return (base || fallback).replace(/\s+/g, '_');
};

const parseTableFromHtml = (html) => {
    const doc = new DOMParser().parseFromString(String(html || ''), 'text/html');
    const tables = doc.querySelectorAll('table');
    if (!tables.length) return [];

    const allRows = [];
    
    tables.forEach((table, index) => {
        if (index > 0) allRows.push([]); // Spacer row

        // We use a 2D grid approach to handle colspan/rowspan correctly
        const rows = Array.from(table.querySelectorAll('tr'));
        const grid = [];
        
        rows.forEach((tr, rowIndex) => {
            if (!grid[rowIndex]) grid[rowIndex] = [];
            let colIndex = 0;
            
            const cells = Array.from(tr.querySelectorAll('th, td'));
            cells.forEach(cell => {
                // Find next available slot in the grid (to handle rowspan from above)
                while (grid[rowIndex][colIndex] !== undefined) {
                    colIndex++;
                }

                const content = String(cell.textContent || '').trim();
                const colspan = parseInt(cell.getAttribute('colspan') || '1');
                const rowspan = parseInt(cell.getAttribute('rowspan') || '1');

                for (let r = 0; r < rowspan; r++) {
                    for (let c = 0; c < colspan; c++) {
                        const targetRow = rowIndex + r;
                        const targetCol = colIndex + c;
                        
                        if (!grid[targetRow]) grid[targetRow] = [];
                        // Fill with content for the first cell of the merge, empty for others
                        grid[targetRow][targetCol] = (r === 0 && c === 0) ? content : '';
                    }
                }
                colIndex += colspan;
            });
        });

        // Filter out empty ghost rows that might have been created by rowspan lookahead
        grid.filter(r => r.length > 0).forEach(r => allRows.push(r));
    });

    return allRows;
};

const downloadExcelFromHtml = ({ html, title }) => {
    const rows = parseTableFromHtml(html);
    if (!rows.length) {
        throw new Error('No tabular data available for Excel export.');
    }

    const ws = XLSX.utils.aoa_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Report');
    XLSX.writeFile(wb, `${sanitizeFileName(title)}.xlsx`);
};

const openHtmlPreviewWindow = ({ html, title = 'Report Preview' }) => {
    const rawHtml = String(html || '');
    const previewHtml = /<body[^>]*>/i.test(rawHtml)
        ? rawHtml.replace(/<body([^>]*)>/i, '<body$1 class="excel-preview">')
        : rawHtml;

    const previewWindow = window.open('', '_blank', 'width=1200,height=800');
    if (!previewWindow) return false;
    previewWindow.document.write(withPrintPaginationCss(previewHtml));
    previewWindow.document.title = `${title} - Preview`;
    previewWindow.document.close();
    previewWindow.focus();
    return true;
};

const buildPdfFromHtml = async ({ html }) => {
    const { jsPDF } = await import('jspdf');

    const sourceHtml = withPrintPaginationCss(String(html || ''));
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.left = '0';
    iframe.style.top = '0';
    iframe.style.width = '1024px';
    iframe.style.height = '1400px';
    iframe.style.opacity = '0';
    iframe.style.pointerEvents = 'none';
    iframe.style.zIndex = '-1';
    document.body.appendChild(iframe);

    try {
        const frameDoc = iframe.contentDocument || iframe.contentWindow?.document;
        if (!frameDoc) throw new Error('Unable to initialize PDF render frame.');

        frameDoc.open();
        frameDoc.write(sourceHtml);
        frameDoc.close();

        await waitForDocumentReady(frameDoc);

        const renderRoot = frameDoc.body;
        if (!renderRoot || !String(renderRoot.textContent || '').trim()) {
            throw new Error('Report content is empty for PDF rendering.');
        }

        const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
        await pdf.html(renderRoot, {
            margin: [30, 20, 30, 20],
            autoPaging: 'text',
            html2canvas: { scale: 0.7, useCORS: true, backgroundColor: '#ffffff' },
            windowWidth: Math.max(frameDoc.documentElement?.scrollWidth || 1024, 1024)
        });
        return pdf;
    } finally {
        if (document.body.contains(iframe)) {
            document.body.removeChild(iframe);
        }
    }
};

const downloadPdfFromHtml = async ({ html, title }) => {
    const pdf = await buildPdfFromHtml({ html });
    pdf.save(`${sanitizeFileName(title)}.pdf`);
};

const openPdfPreviewModal = async ({ blobUrl, title }) => {
    await Swal.fire({
        title: `${String(title || 'Report')} - PDF Preview`,
        backdrop: false,
        html: `
            <div style="height:72vh; max-height:780px; border:1px solid #e2e8f0; border-radius:12px; overflow:hidden; background:#fff;">
                <iframe
                    src="${blobUrl}"
                    title="PDF Preview"
                    style="width:100%; height:100%; border:0;"
                ></iframe>
            </div>
            <p style="margin-top:10px; font-size:12px; color:#64748b;">If preview looks blank, use Open in New Tab.</p>
        `,
        width: '92vw',
        showDenyButton: true,
        showCancelButton: true,
        confirmButtonText: 'Download PDF',
        denyButtonText: 'Open in New Tab',
        cancelButtonText: 'Close',
    }).then((result) => {
        if (result.isConfirmed) {
            const anchor = document.createElement('a');
            anchor.href = blobUrl;
            anchor.download = `${sanitizeFileName(title)}.pdf`;
            document.body.appendChild(anchor);
            anchor.click();
            document.body.removeChild(anchor);
            return;
        }

        if (result.isDenied) {
            window.open(blobUrl, '_blank', 'noopener,noreferrer');
        }
    });

    // Keep the URL alive briefly so embedded and new-tab viewers can load it.
    setTimeout(() => {
        URL.revokeObjectURL(blobUrl);
    }, 60000);
};

const viewPdfFromHtml = async ({ html, title }) => {
    const pdf = await buildPdfFromHtml({ html });
    const blob = pdf.output('blob');
    const blobUrl = URL.createObjectURL(blob);
    const viewerUrl = `${blobUrl}#toolbar=1&navpanes=1&scrollbar=1&view=FitH`;

    const opened = window.open('', '_blank', 'noopener,noreferrer');
    if (!opened) {
        // Fallback to modal when popups are blocked.
        await openPdfPreviewModal({ blobUrl, title });
        return true;
    }

    opened.document.write(`
        <!doctype html>
        <html>
            <head>
                <meta charset="utf-8" />
                <meta name="color-scheme" content="only light" />
                <title>${escapeHtml(String(title || 'PDF Preview'))}</title>
                <style>
                    html, body {
                        margin: 0;
                        padding: 0;
                        width: 100%;
                        height: 100%;
                        background: #ffffff;
                        color-scheme: light;
                        forced-color-adjust: none;
                    }
                    iframe {
                        display: block;
                        width: 100%;
                        height: 100%;
                        border: 0;
                        background: #ffffff;
                    }
                </style>
            </head>
            <body>
                <iframe src="${viewerUrl}" title="PDF Preview"></iframe>
            </body>
        </html>
    `);
    opened.document.close();

    setTimeout(() => {
        URL.revokeObjectURL(blobUrl);
    }, 60000);

    return true;
};

const escapeHtml = (value) => String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const openExcelPreviewModal = async ({ html, title }) => {
    const rows = parseTableFromHtml(html);
    if (!rows.length) {
        throw new Error('No tabular data available for Excel preview.');
    }

    const previewTable = rows
        .map((row, rowIndex) => {
            const tag = rowIndex === 0 ? 'th' : 'td';
            const cells = row
                .map((cell) => `<${tag} style="padding:10px 12px; border:1px solid #e2e8f0; font-size:12px; text-align:left; white-space:nowrap;">${escapeHtml(cell)}</${tag}>`)
                .join('');
            return `<tr>${cells}</tr>`;
        })
        .join('');

    await Swal.fire({
        title: `${String(title || 'Report')} - Excel Preview`,
        html: `
            <div style="max-height:min(72vh,780px); overflow:auto; border:1px solid #e2e8f0; border-radius:12px;">
                <table style="width:100%; border-collapse:collapse; background:#fff;">
                    ${previewTable}
                </table>
            </div>
        `,
        width: '92vw',
        showCancelButton: true,
        confirmButtonText: 'Download Excel',
        cancelButtonText: 'Close'
    }).then((result) => {
        if (result.isConfirmed) {
            downloadExcelFromHtml({ html, title });
        }
    });
};

const chooseFileAction = async (formatLabel = 'file') => {
    const { isConfirmed, isDenied } = await Swal.fire({
        title: `${formatLabel} Report`,
        text: `Do you want to view the ${formatLabel.toLowerCase()} first or download directly?`,
        icon: 'question',
        showCancelButton: true,
        showDenyButton: true,
        confirmButtonText: 'View',
        denyButtonText: 'Download',
        cancelButtonText: 'Cancel'
    });

    if (isConfirmed) return 'view';
    if (isDenied) return 'download';
    return null;
};

const handleFileReportAction = async ({ mode, html, title }) => {
    if (mode !== 'excel' && mode !== 'pdf') return false;

    const action = await chooseFileAction(mode === 'excel' ? 'Excel' : 'PDF');
    if (!action) return false;

    if (mode === 'excel') {
        if (action === 'download') {
            downloadExcelFromHtml({ html, title });
            return true;
        }

        await openExcelPreviewModal({ html, title: String(title || 'Excel Report') });
        return true;
    }

    if (action === 'download') {
        await downloadPdfFromHtml({ html, title });
        return true;
    }

    await viewPdfFromHtml({ html, title });
    return true;
};

const shareReport = async ({ html, title }) => {
    const reportTitle = String(title || 'Report');
    const reportText = `${reportTitle} - shared from PPG EMP HUB`;
    const reportUrl = window.location.href;

    const pdf = await buildPdfFromHtml({ html });
    const pdfBlob = pdf.output('blob');
    const pdfFile = new File([pdfBlob], `${sanitizeFileName(reportTitle)}.pdf`, { type: 'application/pdf' });

    if (navigator.share) {
        try {
            if (navigator.canShare && navigator.canShare({ files: [pdfFile] })) {
                await navigator.share({ title: reportTitle, text: reportText, files: [pdfFile] });
                return;
            }
            // System share is available but file sharing is not. Continue to fallback with document download.
        } catch {
            // User cancellation and API errors fall through to manual choices.
        }
    }

    await downloadPdfFromHtml({ html, title: reportTitle });

    const encodedText = encodeURIComponent(`${reportText}\n${reportUrl}`);
    const encodedSubject = encodeURIComponent(reportTitle);

    const { isConfirmed, isDenied } = await Swal.fire({
        title: 'Share Report',
        text: 'PDF downloaded. Choose where you want to share this report.',
        icon: 'info',
        showCancelButton: true,
        confirmButtonText: 'WhatsApp',
        denyButtonText: 'Email',
        showDenyButton: true,
        cancelButtonText: 'Copy Link'
    });

    if (isConfirmed) {
        window.open(`https://wa.me/?text=${encodedText}`, '_blank', 'noopener,noreferrer');
        return;
    }
    if (isDenied) {
        window.location.href = `mailto:?subject=${encodedSubject}&body=${encodedText}`;
        return;
    }

    await navigator.clipboard?.writeText(`${reportText}\n${reportUrl}`);
    await Swal.fire({ icon: 'success', title: 'Copied', text: 'Report link copied to clipboard.', timer: 1500, showConfirmButton: false });
};

export const choosePrintMode = async () => {
    const { isConfirmed, value } = await Swal.fire({
        title: 'Generate Report',
        input: 'radio',
        inputOptions: {
            print: 'Print',
            excel: 'Excel'
        },
        inputValue: 'print',
        showCancelButton: true,
        confirmButtonText: 'Continue'
    });

    if (!isConfirmed) return null;
    return value || 'print';
};

export const runPrintWindow = async ({
    title,
    html,
    windowFeatures = 'width=1200,height=800',
    delay = 250,
    modeLabel = 'this report',
    closeAfterPrint = false
}) => {
    const mode = await choosePrintMode(modeLabel);
    if (!mode) return false;

    if (mode === 'excel' || mode === 'pdf' || mode === 'share') {
        try {
            if (mode === 'excel' || mode === 'pdf') {
                await handleFileReportAction({ mode, html, title });
            } else {
                await shareReport({ html, title });
            }
            return true;
        } catch (error) {
            await Swal.fire({
                icon: 'error',
                title: 'Report action failed',
                text: error?.message || 'Unable to complete this report action right now.'
            });
            return false;
        }
    }

    const printWindow = window.open('', '_blank', windowFeatures);
    if (!printWindow) {
        return await printWithHiddenIframe({ html, title, delay, closeAfterPrint });
    }

    printWindow.document.write(withPrintPaginationCss(html));
    printWindow.document.close();
    printWindow.focus();

    await waitForDocumentReady(printWindow.document);
    setTimeout(() => {
        printWindow.print();
        if (closeAfterPrint) {
            printWindow.close();
        }
    }, delay);

    return true;
};

export const finalizePrintWindow = async ({
    printWindow,
    title,
    delay = 250,
    modeLabel = 'this report',
    closeAfterPrint = false,
    windowFeatures = 'width=1200,height=800'
}) => {
    if (!printWindow) return false;

    // Preserve the prepared document, then reopen only after user picks output mode.
    const preparedHtml = printWindow.document?.documentElement
        ? withPrintPaginationCss(`<!doctype html>${printWindow.document.documentElement.outerHTML}`)
        : null;

    const inferredFeatures = `width=${printWindow.outerWidth || 1200},height=${printWindow.outerHeight || 800}`;

    try {
        printWindow.close();
    } catch {
        // Ignore close errors and continue.
    }

    if (!preparedHtml) return false;

    const mode = await choosePrintMode(modeLabel);
    if (!mode) return false;

    if (mode === 'excel' || mode === 'pdf' || mode === 'share') {
        try {
            if (mode === 'excel' || mode === 'pdf') {
                await handleFileReportAction({ mode, html: preparedHtml, title });
            } else {
                await shareReport({ html: preparedHtml, title });
            }
            return true;
        } catch (error) {
            await Swal.fire({
                icon: 'error',
                title: 'Report action failed',
                text: error?.message || 'Unable to complete this report action right now.'
            });
            return false;
        }
    }

    const targetWindow = window.open('', '_blank', windowFeatures || inferredFeatures);
    if (!targetWindow) {
        return await printWithHiddenIframe({ html: preparedHtml, title, delay, closeAfterPrint });
    }

    targetWindow.document.write(withPrintPaginationCss(preparedHtml));
    targetWindow.document.close();
    targetWindow.focus();

    await waitForDocumentReady(targetWindow.document);
    setTimeout(() => {
        targetWindow.print();
        if (closeAfterPrint) {
            targetWindow.close();
        }
    }, delay);

    return true;
};
