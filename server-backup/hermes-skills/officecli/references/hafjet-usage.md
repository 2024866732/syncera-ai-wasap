# OfficeCLI usage for HAFJET reporting

## Monthly sales report from Loyverse to Excel

1. Fetch daily sales from Loyverse API (use `loyverse-sales` skill or custom script) and save as CSV `sales.csv`.
2. Import CSV into Excel using OfficeCLI:
   ```bash
   officecli create sales_report.xlsx
   officecli add sales_report.xlsx / --type sheet --name SalesData
   officecli set sales_report.xlsx '/SalesData/A1' --prop value="Date" --prop bold=true
   officecli set sales_report.xlsx '/SalesData/B1' --prop value="Amount (MYR)" --prop bold=true
   # Assuming CSV has header: Date,Amount
   # Use batch to set rows
   ```
3. Add a simple SUM total:
   ```bash
   officecli set sales_report.xlsx '/SalesData/C1' --prop value="TOTAL" --prop bold=true
   officecli set sales_report.xlsx '/SalesData/C2' --prop value="=SUM(B2:B100)" --prop bold=false
   ```
4. Apply currency formatting to column B:
   ```bash
   officecli set sales_report.xlsx '/SalesData/B:B' --prop numberformat="_(* #,##0.00_);_(* (#,##0.00);_(* \"-\"_??);_(@_)"
   ```
5. Create a chart (optional):
   ```bash
   officecli add sales_report.xlsx '/SalesData' --type chart --prop type=line --prop source="SalesData!B2:B100" --prop anchor="D2"
   ```
6. Save and close:
   ```bash
   officecli close sales_report.xlsx
   ```