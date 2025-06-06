const express = require('express');
const fetch = require('node-fetch');
const path = require('path');
const cors = require('cors');
const { PDFDocument } = require('pdf-lib');

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS for all routes
app.use(cors());

// Middleware to parse JSON bodies
app.use(express.json());

// Serve static files from the public directory
app.use(express.static(path.join(__dirname, 'public')));

// Store logs for the frontend
const logs = [];

async function fetchPDFBuffer(url, accessToken) {
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    });

    if (response.ok) {
      const buffer = await response.buffer();
      return buffer;
    } else {
      throw new Error(`Failed to fetch PDF from URL: ${url}`);
    }
  } catch (error) {
    throw new Error(`Error fetching PDF: ${error.message}`);
  }
}

async function mergePDFs(pdfBuffers) {
  try {
    const mergedPdf = await PDFDocument.create();
    
    for (const buffer of pdfBuffers) {
      const pdfDoc = await PDFDocument.load(buffer);
      const pages = await mergedPdf.copyPages(pdfDoc, pdfDoc.getPageIndices());
      pages.forEach(page => mergedPdf.addPage(page));
    }

    const mergedPdfBuffer = await mergedPdf.save();
    return mergedPdfBuffer;
  } catch (error) {
    throw error;
  }
}

// POST endpoint to handle document downloads
app.post('/', async (req, res) => {
  const { accessToken, unitId } = req.body;
  const logs = [];
  
  if (!accessToken || !unitId) {
    return res.status(400).json({ 
      message: 'Missing required parameters',
      logs: logs
    });
  }

  const API_URL = `https://api.tesseractonline.com/studentmaster/get-topics-unit/${unitId}`;
  const BASE_PDF_URL = 'https://api.tesseractonline.com/';

  try {
    const response = await fetch(API_URL, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      throw new Error(`API request failed with status: ${response.status}`);
    }

    const data = await response.json();
    const topics = data.payload?.topics ?? [];
    logs.push(`Found ${topics.length} topics`);
    
    const pdfBuffers = [];

    for (const topic of topics) {
      const relativePdfPath = topic.pdf;
      if (!relativePdfPath) {
        continue;
      }

      const fullPdfUrl = BASE_PDF_URL + relativePdfPath;
      
      try {
        const pdfBuffer = await fetchPDFBuffer(fullPdfUrl, accessToken);
        pdfBuffers.push(pdfBuffer);
      } catch (error) {
        logs.push(`Error processing PDF: ${error.message}`);
      }
    }

    if (pdfBuffers.length > 0) {
      logs.push('Merging PDFs...');
      const mergedPdfBuffer = await mergePDFs(pdfBuffers);
      
      // Convert buffer to base64 and ensure it's properly formatted
      const base64Pdf = Buffer.from(mergedPdfBuffer).toString('base64');
      
      res.json({ 
        message: 'PDFs merged successfully',
        pdfData: base64Pdf,
        logs: logs
      });
    } else {
      res.json({ 
        message: 'No PDFs found to merge',
        logs: logs
      });
    }
  } catch (err) {
    const errorMsg = `Error in fetching or processing the data: ${err.message}`;
    logs.push(errorMsg);
    res.status(500).json({ 
      message: 'Error processing request',
      logs: logs
    });
  }
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});

