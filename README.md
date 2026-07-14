# Qatar Traffic Accident Severity: Machine Learning Analysis
Machine learning analysis of traffic accident severity in the State of Qatar, using the national open accident registry published by the Ministry of Interior.

## Project overview
This project develops and compares classification models (logistic regression, decision tree, random forest) to predict accident severity from recorded accident characteristics, and analyzes which environmental and driver-related factors are most strongly associated with severe outcomes.

## Repository structure
qatar-accident-severity/
|-- data/
|   |-- raw/
|   |   |-- accident.parquet        Frozen snapshot of the full MOI dataset (1,000,500 records)
|   |   |-- accident_sample.csv     First 1,000 rows in readable CSV form, for browsing
|   |-- cleaned/                    Cleaned dataset (will be added during the analysis phase)
|-- notebooks/                      Analysis notebooks (will be added during the analysis phase)
|-- README.md

## Data source and license
The dataset 'accident.parquet' is published by the **Ministry of Interior, State of Qatar**, via the Qatar Open Data Portal:
https://www.data.gov.qa/explore/dataset/accident/

It is licensed under **CC BY 4.0** and is redistributed here unmodified, with attribution, for academic research purposes. All analysis code in this repository is the author's own work (MIT License).

**Snapshot details (frozen study dataset):**
- Retrieved: 12 July 2026
- Records: 1,000,500
- Columns: 16
- Timeframe: 2020 to 2025
- Note: the portal continues to add records; this snapshot is the fixed dataset used throughout the study.

## Reading the data
```python
import pandas as pd
df = pd.read_parquet("data/raw/accident.parquet")   # requires pyarrow
```
The original portal CSV export uses a semicolon separator; if working from a portal CSV instead of this Parquet snapshot, use `pd.read_csv(path, sep=";")`.

## Target variable
`accident_severity`, distribution in the snapshot:

| Class | Records |
|---|---|
| SIMPLE | 829,530 |
| LIGHT INJURY | 37,407 |
| HEAVY INJURY | 2,294 |
| DEATH INJURY | 786 |
| NOT AN TRAFFIC ACCIDENT (variants) | 448 |
| Missing | 130,035 |
Inclusion/exclusion: records labeled as non-traffic incidents and records with missing severity are excluded from modeling, leaving **870,017 usable records**.

## Author
Tariq Alhefny, Walsh College, QM640 Data Analytics Capstone, Term 3 - Summer 2026.
