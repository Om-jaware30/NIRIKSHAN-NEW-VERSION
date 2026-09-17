# NIRIKSHAN 10 data migration notes

The runtime model is now MP/constituency portfolio centric because the supplied allocation export contains 774 MP records. Work-level detail is attached to each portfolio through recent supplied recommendation/completion records and recent supplied expenditure transactions.

Financial progress is calculated as:
`Total Expenditure / Allocated Amount × 100`

Physical progress is taken from the supplied `Completion Rate %` field.

This keeps the existing progress-analysis concept while grounding it in the new register fields.

The existing NIRIKSHAN four-role navigation and lifecycle remain unchanged. Only the underlying data model and module interpretation are adapted to the supplied MPLADS records.
