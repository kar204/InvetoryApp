import { ServiceTicket } from '@/types/database';
import { Button } from '@/components/ui/button';
import { Printer } from 'lucide-react';

interface PrintTicketProps {
  ticket: ServiceTicket;
  profileName: string;
  invertorProfileName?: string;
}

export function PrintTicket({ ticket, profileName, invertorProfileName }: PrintTicketProps) {
  const handlePrint = async () => {
    const hasBatteryResolution = ticket.battery_resolved;
    const hasInvertorResolution = ticket.invertor_model && ticket.invertor_resolved;
    const totalPrice = (ticket.battery_price || 0) + (ticket.invertor_price || 0);

    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    printWindow.document.open();
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>&nbsp;</title>
          <style>
            @page {
              size: 58mm auto;
              margin: 0 !important;
            }
            html, body {
              margin: 0 !important;
              padding: 0 !important;
              width: 58mm;
              background: white;
              display: block !important;
              height: auto !important;
              min-height: 0 !important;
            }
            body {
              font-family: 'Calibri', 'Segoe UI', 'Arial', sans-serif;
              color: black;
              position: absolute;
              top: 0;
              left: 0;
              padding: 2mm;
              box-sizing: border-box;
              font-size: 13px;
              line-height: 1.4; /* Slightly reduced line spacing from 1.8 */
            }
            .receipt-header {
              text-align: center;
              border-bottom: 2px solid #000;
              padding-bottom: 6px;
              margin-bottom: 10px;
            }
            .receipt-header h1 {
              margin: 0;
              font-size: 18px;
              text-transform: uppercase;
              font-weight: bold;
            }
            .shop-contact {
              font-size: 14px;
              margin-top: 4px;
              font-weight: bold;
            }
            .ticket-number-box {
              margin-top: 6px;
              padding: 4px;
              border: 1px solid #000;
              display: inline-block;
              width: 90%;
            }
            .ticket-number {
              font-size: 28px; /* Maxed size for AFT number */
              font-weight: 900;
              letter-spacing: 1px;
            }
            .section {
              margin-bottom: 8px; /* Slightly reduced spacing from 12px */
              display: flex;
              justify-content: space-between;
              padding-bottom: 3px;
              border-bottom: 0.5px solid #000;
            }
            .description-box {
              margin-bottom: 12px;
              padding: 5px;
              border: 0.5px dashed #000;
              min-height: 35px;
              line-height: 1.3;
            }
            .label {
              font-weight: bold;
              color: #000;
              font-size: 13px;
            }
            .value {
              font-size: 13px;
              text-align: right;
              font-weight: bold;
              flex: 1;
              padding-left: 8px;
            }
            .resolution-section {
              margin-top: 10px;
              padding: 6px;
              border: 1px solid #000;
            }
            .resolution-section h2 {
              font-size: 14px;
              margin: 0 0 6px 0;
              text-align: center;
              font-weight: bold;
              text-decoration: underline;
            }
            .total-section {
              margin-top: 10px;
              padding: 8px;
              border-top: 2px solid #000;
              border-bottom: 2px solid #000;
              text-align: center;
            }
            .total-label {
              font-size: 14px;
              font-weight: bold;
            }
            .total-value {
              font-size: 28px;
              font-weight: bold;
            }
            .payment-info {
              font-size: 16px;
              font-weight: bold;
              margin-top: 4px;
            }
            .terms-section {
              margin-top: 12px;
              font-size: 11px;
              text-align: left;
              line-height: 1.3;
              border-top: 1px solid #000;
              padding-top: 8px;
            }
            .footer {
              margin-top: 12px;
              text-align: center;
              font-size: 11px;
              border-top: 1px dashed #000;
              padding-top: 8px;
              padding-bottom: 8mm;
            }
            .signature-space {
              margin-top: 30px;
              display: flex;
              justify-content: space-between;
              gap: 12px;
            }
            .sig-box {
              border-top: 1px solid #000;
              flex: 1;
              text-align: center;
              padding-top: 5px;
              font-size: 10px;
              font-weight: bold;
            }
          </style>
        </head>
        <body>
          <div class="receipt-header">
            <h1>Service Receipt</h1>
            <div class="shop-contact">Contact: +91-8900978758</div>
            <div class="ticket-number-box">
              <div class="ticket-number">#${ticket.ticket_number}</div>
            </div>
          </div>

          <div class="section">
            <span class="label">Date:</span>
            <span class="value">${new Date(ticket.created_at).toLocaleDateString('en-IN')}</span>
          </div>
          <div class="section">
            <span class="label">Customer:</span>
            <span class="value">${ticket.customer_name}</span>
          </div>
          <div class="section">
            <span class="label">Phone:</span>
            <span class="value">${ticket.customer_phone}</span>
          </div>
          <div class="section">
            <span class="label">Battery:</span>
            <span class="value">${ticket.battery_model || '-'}</span>
          </div>
          <div class="section">
            <span class="label">Invertor:</span>
            <span class="value">${ticket.invertor_model || '-'}</span>
          </div>

          <div class="label" style="margin-top: 10px;">Issue Reported:</div>
          <div class="description-box">
            ${ticket.issue_description || 'No description provided'}
          </div>
          
          ${hasBatteryResolution ? `
          <div class="resolution-section">
            <h2>Battery Service</h2>
            <div class="section">
              <span class="label">Status:</span>
              <span class="value">RESOLVED</span>
            </div>
            <div class="section">
              <span class="label">Charge:</span>
              <span class="value">₹${(ticket.battery_price || 0).toFixed(2)}</span>
            </div>
          </div>
          ` : ''}
          
          ${hasInvertorResolution ? `
          <div class="resolution-section">
            <h2>Invertor Service</h2>
            <div class="section">
              <span class="label">Status:</span>
              <span class="value">RESOLVED</span>
            </div>
            <div class="section">
              <span class="label">Charge:</span>
              <span class="value">₹${(ticket.invertor_price || 0).toFixed(2)}</span>
            </div>
          </div>
          ` : ''}
          
          ${(hasBatteryResolution || hasInvertorResolution) ? `
          <div class="total-section">
            <div class="total-label">TOTAL AMOUNT</div>
            <div class="total-value">₹${totalPrice.toFixed(2)}</div>
            ${ticket.payment_method ? `
            <div class="payment-info">Paid via: ${ticket.payment_method}</div>
            ` : ''}
          </div>
          ` : ''}
          
          <div class="terms-section">
            <strong>Terms & Conditions:</strong><br/>
            - Not responsible for any data loss.<br/>
            - Please bring this receipt for pickup.<br/>
            - Items not collected within 30 days may be disposed of.
          </div>

          <div class="signature-space">
            <div class="sig-box">Customer</div>
            <div class="sig-box">Signatory</div>
          </div>

          <div class="footer">
            Printed: ${new Date().toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })}<br/>
            Thank you for choosing our service!
          </div>
        </body>
      </html>
    `);

    printWindow.document.close();
    printWindow.focus();
    // Wait for content to render
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 250);
  };

  return (
    <Button variant="outline" size="sm" onClick={handlePrint}>
      <Printer className="h-4 w-4 mr-2" />
      Print
    </Button>
  );
}