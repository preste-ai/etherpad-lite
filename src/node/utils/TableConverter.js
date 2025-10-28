/**
 * Converts HTML table to ep_data_tables plugin format
 * Returns an array of line objects that can be inserted into Etherpad
 */

const DELIMITER = "\u241F"; // The delimiter used by ep_data_tables
const ATTR_CLASS_PREFIX = "tbljson-";

/**
 * Generate a random table ID
 */
function generateTableId() {
  return Math.random().toString(36).slice(2, 8);
}

/**
 * Base64 encode (compatible with plugin's enc function)
 */
function enc(s) {
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_");
}

/**
 * Strip HTML tags and decode entities from cell content
 * @param {string} cellHtml - HTML content of the cell
 * @param {Document} doc - Document object (from browser or jsdom)
 */
function extractCellText(cellHtml, doc) {
  // Create a temporary div to parse HTML
  const tempDiv = doc.createElement('div');
  tempDiv.innerHTML = cellHtml;
  
  // Get text content (automatically decodes HTML entities)
  let text = tempDiv.textContent || tempDiv.innerText || '';
  
  // Normalize whitespace
  text = text.replace(/[\r\n\t]/g, ' ').replace(/\s+/g, ' ').trim();
  
  // Replace delimiter if it exists in the text
  text = text.replace(new RegExp(DELIMITER, 'g'), ' ');
  
  // If empty, use a space to maintain cell structure
  return text || ' ';
}

/**
 * Escape HTML for safe insertion
 */
function escapeHtml(text = "") {
  const strText = String(text);
  const map = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  };
  return strText.replace(/[&<>"']/g, (m) => map[m]);
}

/**
 * Build simple HTML that Etherpad can import and process
 * Instead of building the full rendered structure, create simplified HTML
 * that Etherpad's content collector can handle
 */
function buildSimpleEtherpadTableHTML(metadata, cellTexts) {
  const numCols = cellTexts.length;
  const columnWidths = metadata.columnWidths || Array(numCols).fill(100 / numCols);
  
  // Ensure columnWidths matches numCols
  while (columnWidths.length < numCols) {
    columnWidths.push(100 / numCols);
  }
  if (columnWidths.length > numCols) {
    columnWidths.splice(numCols);
  }
  
  // Encode metadata for class
  let encodedTbljsonClass = "";
  try {
    encodedTbljsonClass = `${ATTR_CLASS_PREFIX}${enc(JSON.stringify(metadata))}`;
  } catch (_) {
    encodedTbljsonClass = "";
  }
  
  // Build simple cells - just text with class markers
  const cellsHtml = cellTexts.map((cellText, index) => {
    const escapedText = escapeHtml(cellText);
    const cellClass = `tblCell-${index}`;
    const tbljsonClassAttr = encodedTbljsonClass ? ` ${encodedTbljsonClass}` : '';
    
    // Simple span with text - Etherpad will handle the rest
    const content = escapedText || '&nbsp;';
    
    return `<span class="${cellClass}${tbljsonClassAttr}">${content}</span>`;
  }).join(DELIMITER);
  
  // Return just the delimited content wrapped in a span with table metadata class
  return `<span class="${encodedTbljsonClass}">${cellsHtml}</span>`;
}

/**
 * Build rendered table HTML as it would appear in Etherpad
 * This version is for display/preview purposes, not for import
 */
function buildEtherpadTableHTML(metadata, cellTexts) {
  const numCols = cellTexts.length;
  const columnWidths = metadata.columnWidths || Array(numCols).fill(100 / numCols);
  
  // Ensure columnWidths matches numCols
  while (columnWidths.length < numCols) {
    columnWidths.push(100 / numCols);
  }
  if (columnWidths.length > numCols) {
    columnWidths.splice(numCols);
  }
  
  const tdStyle = `padding: 5px 7px; word-wrap:break-word; vertical-align: top; border: 1px solid #000; position: relative;`;
  
  // Encode metadata for class
  let encodedTbljsonClass = "";
  try {
    encodedTbljsonClass = `${ATTR_CLASS_PREFIX}${enc(JSON.stringify(metadata))}`;
  } catch (_) {
    encodedTbljsonClass = "";
  }
  
  // Build cells HTML
  const cellsHtml = cellTexts.map((cellText, index) => {
    const escapedText = escapeHtml(cellText);
    const isEmpty = !cellText || cellText.trim() === '';
    
    let cellContent;
    if (isEmpty) {
      const cellClass = encodedTbljsonClass
        ? `${encodedTbljsonClass} tblCell-${index}`
        : `tblCell-${index}`;
      cellContent = `<span class="${cellClass}">&nbsp;</span>`;
    } else {
      const cellClass = encodedTbljsonClass
        ? `${encodedTbljsonClass} tblCell-${index}`
        : `tblCell-${index}`;
      cellContent = `<span class="${cellClass}">${escapedText}</span>`;
    }
    
    // Add hidden delimiter for cells after the first
    if (index > 0) {
      const delimSpan = `<span class="ep-data_tables-delim" contenteditable="false">${DELIMITER}</span>`;
      cellContent = delimSpan + cellContent;
    }
    
    // Add caret anchor
    const caretAnchorSpan = '<span class="ep-data_tables-caret-anchor" contenteditable="false"></span>';
    cellContent = cellContent + caretAnchorSpan;
    
    const widthPercent = columnWidths[index] || (100 / numCols);
    const cellStyle = `${tdStyle} width: ${widthPercent}%;`;
    
    // Add resize handle (except for last column)
    const isLastColumn = index === cellTexts.length - 1;
    const resizeHandle = !isLastColumn
      ? `<div class="ep-data_tables-resize-handle" data-column="${index}" style="position: absolute; top: 0; right: -2px; width: 4px; height: 100%; cursor: col-resize; background: transparent; z-index: 10;"></div>`
      : "";
    
    return `<td style="${cellStyle}" data-column="${index}" draggable="false">${cellContent}${resizeHandle}</td>`;
  }).join('');
  
  const firstRowClass = metadata.row === 0 ? " dataTable-first-row" : "";
  
  const tableHtml = `<table class="dataTable${firstRowClass}" writingsuggestions="false" data-tblId="${metadata.tblId}" data-row="${metadata.row}" style="width:100%; border-collapse: collapse; table-layout: fixed;" draggable="false"><tbody><tr>${cellsHtml}</tr></tbody></table>`;
  
  return tableHtml;
}

/**
 * Parse HTML table and extract structure
 * @param {HTMLTableElement} tableElement - The table element to parse
 * @param {Document} doc - Document object (from browser or jsdom)
 */
function parseHtmlTable(tableElement, doc) {
  const rows = [];
  const tableRows = tableElement.querySelectorAll('tr');
  
  tableRows.forEach((tr) => {
    const cells = [];
    const cellElements = tr.querySelectorAll('td, th');
    
    cellElements.forEach((cell) => {
      cells.push({
        text: extractCellText(cell.innerHTML, doc),
        html: cell.innerHTML // Keep original HTML for reference
      });
    });
    
    if (cells.length > 0) {
      rows.push(cells);
    }
  });
  
  return rows;
}

/**
 * Calculate column widths from HTML table
 */
function extractColumnWidths(tableElement, numCols) {
  const columnWidths = [];
  
  // Try to get widths from first row
  const firstRow = tableElement.querySelector('tr');
  if (firstRow) {
    const cells = firstRow.querySelectorAll('td, th');
    
    cells.forEach((cell) => {
      const style = cell.getAttribute('style') || '';
      const widthMatch = style.match(/width:\s*([0-9.]+)%/);
      
      if (widthMatch) {
        columnWidths.push(parseFloat(widthMatch[1]));
      } else {
        // Try to get width from attributes
        const width = cell.getAttribute('width');
        if (width && width.includes('%')) {
          columnWidths.push(parseFloat(width));
        } else {
          columnWidths.push(100 / numCols);
        }
      }
    });
  }
  
  // If we didn't get enough widths, fill with equal distribution
  while (columnWidths.length < numCols) {
    columnWidths.push(100 / numCols);
  }
  
  // Normalize to ensure total is 100%
  const totalWidth = columnWidths.reduce((sum, width) => sum + width, 0);
  if (totalWidth > 0) {
    columnWidths.forEach((width, index) => {
      columnWidths[index] = (width / totalWidth) * 100;
    });
  }
  
  return columnWidths;
}

/**
 * Convert single HTML table element to Etherpad table HTML
 * @param {HTMLTableElement} tableElement - The table to convert
 * @param {Document} doc - Document object (from browser or jsdom)
 * @param {boolean} forImport - If true, generate simple HTML for import; if false, generate full rendered HTML
 */
function convertSingleTableToEtherpad(tableElement, doc, forImport = true) {
  // Parse the table structure
  const rows = parseHtmlTable(tableElement, doc);
  
  if (rows.length === 0) {
    return '<p><!-- Empty table removed --></p>';
  }
  
  // Determine number of columns
  const numCols = Math.max(...rows.map(row => row.length));
  
  // Generate table ID
  const tblId = generateTableId();
  
  // Extract column widths
  const columnWidths = extractColumnWidths(tableElement, numCols);
  
  if (forImport) {
    // Generate simple format for Etherpad import
    const lines = rows.map((row, rowIndex) => {
      // Ensure all rows have the same number of columns
      while (row.length < numCols) {
        row.push({ text: ' ', html: '' });
      }
      
      // Create metadata
      const metadata = {
        tblId: tblId,
        row: rowIndex,
        cols: numCols,
        columnWidths: columnWidths
      };
      
      // Get cell texts
      const cellTexts = row.map(cell => cell.text);
      
      // Build simple line with delimiter
      const lineText = cellTexts.join(DELIMITER);
      
      // Encode metadata for class
      let encodedTbljsonClass = "";
      try {
        encodedTbljsonClass = `${ATTR_CLASS_PREFIX}${enc(JSON.stringify(metadata))}`;
      } catch (_) {
        encodedTbljsonClass = "";
      }
      
      // Return simple paragraph with class marker
      return `<p class="${encodedTbljsonClass}">${escapeHtml(lineText)}</p>`;
    });
    
    return lines.join('\n');
  } else {
    // Generate full rendered format (for preview/display)
    const etherpadRows = rows.map((row, rowIndex) => {
      // Ensure all rows have the same number of columns
      while (row.length < numCols) {
        row.push({ text: ' ', html: '' });
      }
      
      // Create metadata
      const metadata = {
        tblId: tblId,
        row: rowIndex,
        cols: numCols,
        columnWidths: columnWidths
      };
      
      // Get cell texts
      const cellTexts = row.map(cell => cell.text);
      
      // Build the rendered table HTML
      const tableHtml = buildEtherpadTableHTML(metadata, cellTexts);
      
      return tableHtml;
    });
    
    // Wrap each row in a div (simulating ace-line)
    const wrappedRows = etherpadRows.map((rowHtml, index) => 
      `<div class="ace-line" id="line-${tblId}-${index}">${rowHtml}</div>`
    ).join('\n');
    
    return wrappedRows;
  }
}

/**
 * Main function: Convert HTML page with tables to Etherpad format
 * @param {string} htmlPage - Complete HTML page content
 * @param {boolean} forImport - If true, generate format for Etherpad import (default: true)
 * @returns {string} - HTML page with tables converted to Etherpad format
 */
function convertHtmlTableToEpDataTables(htmlPage, forImport = true) {
  // Check if we're in Node.js or browser environment
  let doc, isNodeJS = false;
  
  if (typeof window !== 'undefined' && window.DOMParser) {
    // Browser environment
    const parser = new DOMParser();
    doc = parser.parseFromString(htmlPage, 'text/html');
  } else {
    // Node.js environment - use jsdom
    try {
      const { JSDOM } = require('jsdom');
      const dom = new JSDOM(htmlPage);
      doc = dom.window.document;
      isNodeJS = true;
    } catch (error) {
      console.error('Error: jsdom is required for Node.js environment. Install it with: npm install jsdom');
      throw new Error('jsdom is required for Node.js environment. Run: npm install jsdom');
    }
  }
  
  // Find all tables in the document
  const tables = doc.querySelectorAll('table');
  
  if (tables.length === 0) {
    // No tables found, return original HTML
    return htmlPage;
  }
  
  console.log(`Found ${tables.length} table(s) to convert`);
  
  // Convert each table
  tables.forEach((table, index) => {
    console.log(`Converting table ${index + 1}/${tables.length}`);
    
    try {
      // Convert the table to Etherpad format
      const etherpadTableHtml = convertSingleTableToEtherpad(table, doc, forImport);
      
      // Create a temporary container for the new content
      const tempDiv = doc.createElement('div');
      tempDiv.innerHTML = etherpadTableHtml;
      
      // Replace the original table with the converted version
      table.parentNode.replaceChild(tempDiv, table);
      
      // Unwrap the temp div (move its children up)
      while (tempDiv.firstChild) {
        tempDiv.parentNode.insertBefore(tempDiv.firstChild, tempDiv);
      }
      tempDiv.remove();
      
      console.log(`Table ${index + 1} converted successfully`);
    } catch (error) {
      console.error(`Error converting table ${index + 1}:`, error);
      // Leave the original table in place if conversion fails
    }
  });
  
  // Serialize the modified document back to HTML
  let resultHtml;
  if (isNodeJS) {
    // Use jsdom's serialize method
    resultHtml = doc.documentElement.outerHTML;
  } else {
    // Use XMLSerializer in browser
    const serializer = new XMLSerializer();
    resultHtml = serializer.serializeToString(doc);
  }
  
  return resultHtml;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    convertHtmlTableToEpDataTables,
    convertSingleTableToEtherpad,
    generateTableId,
    extractCellText,
    escapeHtml
  };
}