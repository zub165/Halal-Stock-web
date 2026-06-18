let portfolio = JSON.parse(localStorage.getItem("portfolio")) || [];
// Set the Google Sheets Web App endpoint
const GOOGLE_SHEET_URL = "https://script.google.com/macros/s/AKfycbwGVlFukJAFNJ_6jmnq93_rQkoPDnSPqudh6dvwbFABkzw5jjKWqpLWPH7vXD7ODd8/exec";

const form = document.getElementById("add-stock-form");
const tbody = document.getElementById("portfolio-body");
const pieToggle = document.getElementById("pie-toggle");

let barChart, pieChart;

function savePortfolio() {
  localStorage.setItem("portfolio", JSON.stringify(portfolio));
}

function renderPortfolio() {
  tbody.innerHTML = "";
  let filtered = [...portfolio];

  const filter = document.getElementById("filter-option").value;
  if (filter === "low-yield") filtered = filtered.filter(s => s.yield < 2);
  if (filter === "high-yield") filtered = filtered.filter(s => s.yield >= 2);

  const sort = document.getElementById("sort-option").value;
  if (sort === "ticker") filtered.sort((a, b) => a.ticker.localeCompare(b.ticker));
  if (sort === "yield") filtered.sort((a, b) => b.yield - a.yield);
  if (sort === "value") filtered.sort((a, b) => (b.shares * b.price) - (a.shares * a.price));
  if (sort === "dividend") filtered.sort((a, b) => ((b.shares * b.price * b.yield) - (a.shares * a.price * a.yield)));

  filtered.forEach((stock, index) => {
    const annual = stock.shares * (stock.price * stock.yield / 100);
    const monthly = annual / 12;
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${stock.ticker}</td>
      <td>${stock.shares}</td>
      <td>$${stock.price.toFixed(2)}</td>
      <td>${stock.yield.toFixed(2)}</td>
      <td>$${annual.toFixed(2)}</td>
      <td>$${monthly.toFixed(2)}</td>
      <td>
        <button onclick="editStock(${index})">✏️</button>
        <button onclick="deleteStock(${index})">🗑️</button>
      </td>
    `;
    tbody.appendChild(row);
  });

  // Calculate totals
  const totalAnnual = filtered.reduce((sum, s) => sum + (s.shares * s.price * s.yield / 100), 0);
  const totalMonthly = totalAnnual / 12;
  const totalMarketValue = filtered.reduce((sum, s) => sum + (s.shares * s.price), 0);

  // Add Totals row
  const totalsRow = document.createElement("tr");
  totalsRow.style.fontWeight = "bold";
  totalsRow.style.background = "#f0f0f0";
  totalsRow.innerHTML = `
    <td>Totals:</td>
    <td></td>
    <td>$${totalMarketValue.toFixed(2)}</td>
    <td></td>
    <td>$${totalAnnual.toFixed(2)}</td>
    <td>$${totalMonthly.toFixed(2)}</td>
    <td></td>
  `;
  tbody.appendChild(totalsRow);

  // Add Monthly row (optional, for clarity)
  const monthlyRow = document.createElement("tr");
  monthlyRow.style.fontWeight = "bold";
  monthlyRow.style.background = "#f9f9f9";
  monthlyRow.innerHTML = `
    <td>Monthly:</td>
    <td></td>
    <td></td>
    <td></td>
    <td></td>
    <td>$${totalMonthly.toFixed(2)}</td>
    <td></td>
  `;
  tbody.appendChild(monthlyRow);

  renderBarChart(filtered);
  renderPieChart(filtered);
}

function renderBarChart(data) {
  const labels = data.map(s => s.ticker);
  const dividends = data.map(s => ((s.shares * s.price * s.yield) / 1200).toFixed(2));

  if (barChart) barChart.destroy();
  barChart = new Chart(document.getElementById("barChart"), {
    type: "bar",
    data: {
      labels: labels,
      datasets: [{ label: "Monthly Dividend ($)", data: dividends }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true } }
    }
  });
}

function renderPieChart(data) {
  const mode = pieToggle.value;
  const labels = data.map(s => s.ticker);
  const values = data.map(s => {
    if (mode === "dividend") return (s.shares * s.price * s.yield / 1200);
    else return s.shares * s.price;
  });

  if (pieChart) pieChart.destroy();
  pieChart = new Chart(document.getElementById("pieChart"), {
    type: "pie",
    data: { labels, datasets: [{ data: values }] },
    options: { responsive: true }
  });
}

function editStock(index) {
  const stock = portfolio[index];
  const newShares = parseFloat(prompt("Update Shares:", stock.shares));
  const newPrice = parseFloat(prompt("Update Price:", stock.price));
  const newYield = parseFloat(prompt("Update Yield:", stock.yield));

  if (!isNaN(newShares) && !isNaN(newPrice) && !isNaN(newYield)) {
    portfolio[index] = { ...stock, shares: newShares, price: newPrice, yield: newYield };
    savePortfolio();
    renderPortfolio();
  }
}

function deleteStock(index) {
  if (confirm("Delete this stock?")) {
    portfolio.splice(index, 1);
    savePortfolio();
    renderPortfolio();
  }
}

async function syncToGoogleSheets(stock) {
  try {
    await fetch(GOOGLE_SHEET_URL, {
      method: "POST",
      body: JSON.stringify(stock),
      headers: { "Content-Type": "application/json" }
    });
    updateSyncStatus();
  } catch (err) {
    console.error("Sync failed:", err);
  }
}

// Improved: Load data from Google Sheets and handle header-only response
async function loadFromGoogleSheets() {
  try {
    const response = await fetch(GOOGLE_SHEET_URL);
    const data = await response.json();
    // If only header row is returned, do not overwrite portfolio
    if (!data || data.length <= 1) {
      alert("No portfolio data found in Google Sheets.");
      return;
    }
    // If data is a single string row, try to parse further (future-proofing)
    if (data.length === 1 && typeof data[0][0] === "string" && data[0][0].includes("|")) {
      alert("No portfolio data found in Google Sheets.");
      return;
    }
    // Otherwise, parse rows into portfolio, skipping summary rows
    portfolio = data.slice(1)
      .filter(row => row[0] && row[0] !== "Totals:" && row[0] !== "Monthly:")
      .map(row => ({
        ticker: row[0],
        shares: parseFloat(row[1]),
        price: parseFloat(row[2]),
        yield: parseFloat(row[3])
      }));
    savePortfolio();
    renderPortfolio();
    updateSyncStatus();
  } catch {
    alert("Failed to load from Google Sheets.");
  }
}

function exportToCSV() {
  const rows = [["Ticker", "Shares", "Price", "Yield", "Annual", "Monthly"]];
  portfolio.forEach(s => {
    const annual = s.shares * s.price * s.yield / 100;
    rows.push([
      s.ticker, s.shares, s.price.toFixed(2), s.yield.toFixed(2),
      annual.toFixed(2), (annual / 12).toFixed(2)
    ]);
  });
  const blob = new Blob([rows.map(r => r.join(",")).join("\n")], { type: "text/csv" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "portfolio.csv";
  link.click();
}

function updateSyncStatus() {
  document.getElementById("sync-status").textContent = `Last sync: ${new Date().toLocaleTimeString()}`;
}

setInterval(() => {
  portfolio.forEach(syncToGoogleSheets);
}, 300000); // 5 min

form.addEventListener("submit", async e => {
  e.preventDefault();
  const ticker = document.getElementById("ticker").value.toUpperCase();
  const shares = parseFloat(document.getElementById("shares").value);
  const price = parseFloat(document.getElementById("price").value);
  const yieldPct = parseFloat(document.getElementById("yield").value);

  const newStock = { ticker, shares, price, yield: yieldPct };
  portfolio.push(newStock);
  savePortfolio();
  renderPortfolio();
  await syncToGoogleSheets(newStock);
  form.reset();
});

document.getElementById("export-csv").addEventListener("click", exportToCSV);
document.getElementById("load-google").addEventListener("click", loadFromGoogleSheets);
document.getElementById("sort-option").addEventListener("change", renderPortfolio);
document.getElementById("filter-option").addEventListener("change", renderPortfolio);
pieToggle.addEventListener("change", renderPortfolio);
document.addEventListener("DOMContentLoaded", renderPortfolio);

// Suggest Best Halal Portfolio logic
function suggestPortfolio(amount, mode) {
  // Clone and sort portfolio based on mode
  let sorted = [...portfolio];
  if (mode === 'dividends') {
    sorted.sort((a, b) => (b.yield - a.yield));
  } else if (mode === 'price') {
    sorted.sort((a, b) => (a.price - b.price));
  } else if (mode === 'diversified') {
    sorted.sort((a, b) => (b.yield / b.price - a.yield / a.price)); // yield per $ spent
  }

  let remaining = amount;
  let suggestion = [];

  if (mode === 'diversified') {
    // Try to buy at least 1 share of as many different stocks as possible, then fill with best yield/price
    sorted.forEach(stock => {
      if (remaining >= stock.price) {
        suggestion.push({ ...stock, shares: 1 });
        remaining -= stock.price;
      }
    });
    // Use remaining for best yield/price
    sorted.forEach(stock => {
      let s = suggestion.find(sug => sug.ticker === stock.ticker);
      if (!s) return;
      let maxExtra = Math.floor(remaining / stock.price);
      if (maxExtra > 0) {
        s.shares += maxExtra;
        remaining -= maxExtra * stock.price;
      }
    });
  } else {
    // Greedy: buy as many shares as possible of best stock(s)
    for (let i = 0; i < sorted.length; i++) {
      let stock = sorted[i];
      let maxShares = Math.floor(remaining / stock.price);
      if (maxShares > 0) {
        suggestion.push({ ...stock, shares: maxShares });
        remaining -= maxShares * stock.price;
      }
    }
  }

  // Calculate totals
  let totalInvested = suggestion.reduce((sum, s) => sum + s.shares * s.price, 0);
  let totalAnnual = suggestion.reduce((sum, s) => sum + s.shares * s.price * s.yield / 100, 0);
  let totalMonthly = totalAnnual / 12;

  return { suggestion, totalInvested, totalAnnual, totalMonthly, cashLeft: remaining };
}

function renderSuggestedPortfolio(result) {
  const div = document.getElementById('suggested-portfolio');
  if (!result || !result.suggestion.length) {
    div.innerHTML = '<p>No valid portfolio could be suggested for the given amount.</p>';
    return;
  }
  let html = `<table style="width:100%;border-collapse:collapse;">
    <thead><tr>
      <th>Ticker</th><th>Shares</th><th>Price</th><th>Yield (%)</th><th>Annual Div</th><th>Monthly Div</th><th>Cost</th>
    </tr></thead><tbody>`;
  result.suggestion.forEach(s => {
    const annual = s.shares * s.price * s.yield / 100;
    const monthly = annual / 12;
    const cost = s.shares * s.price;
    html += `<tr>
      <td>${s.ticker}</td>
      <td>${s.shares}</td>
      <td>$${s.price.toFixed(2)}</td>
      <td>${s.yield.toFixed(2)}</td>
      <td>$${annual.toFixed(2)}</td>
      <td>$${monthly.toFixed(2)}</td>
      <td>$${cost.toFixed(2)}</td>
    </tr>`;
  });
  html += `</tbody></table>`;
  // Calculate ROI
  const roi = result.totalInvested > 0 ? (result.totalAnnual / result.totalInvested) * 100 : 0;

  // Projected income and ROI for multiple years
  const years = [5, 10, 15, 20, 30];
  let projections = '<div style="margin-top:1em;"><b>Projected Income & ROI:</b><br><table style="margin-top:0.5em;width:auto;">';
  projections += '<tr><th>Years</th>' + years.map(y => `<td>${y}</td>`).join('') + '</tr>';
  projections += '<tr><th>Income</th>' + years.map(y => `<td>$${(result.totalAnnual * y).toFixed(2)}</td>`).join('') + '</tr>';
  projections += '<tr><th>ROI (%)</th>' + years.map(y => `<td>${(result.totalInvested > 0 ? (result.totalAnnual * y / result.totalInvested * 100) : 0).toFixed(2)}%</td>`).join('') + '</tr>';
  projections += '</table></div>';

  html += `<div style="margin-top:1em;font-weight:bold;">
    Total Invested: $${result.totalInvested.toFixed(2)}<br>
    Est. Annual Div: $${result.totalAnnual.toFixed(2)}<br>
    Est. Monthly Div: $${result.totalMonthly.toFixed(2)}<br>
    ROI: ${roi.toFixed(2)}%<br>
    Cash Left: $${result.cashLeft.toFixed(2)}
  </div>`;
  html += projections;
  div.innerHTML = html;
}

// Event listener for Suggest Portfolio button
const suggestBtn = document.getElementById('suggest-portfolio');
if (suggestBtn) {
  suggestBtn.addEventListener('click', () => {
    const amount = parseFloat(document.getElementById('invest-amount').value);
    const mode = document.getElementById('optimize-mode').value;
    if (isNaN(amount) || amount <= 0) {
      document.getElementById('suggested-portfolio').innerHTML = '<p>Please enter a valid amount to invest.</p>';
      return;
    }
    const result = suggestPortfolio(amount, mode);
    renderSuggestedPortfolio(result);
  });
}
