#!/usr/bin/env python3
"""
Prepare a flattened ecommerce event export for the browser.

Input:
    CSV exported from BigQuery using scripts/ga4_export.sql

Output:
    Parquet matching the application's expected data contract.

Example:
    python scripts/prepare_data.py raw/ga4_funnel.csv data/ecommerce_events.parquet
"""

from __future__ import annotations

import argparse
from pathlib import Path

import pandas as pd
from pandas.tseries.holiday import USFederalHolidayCalendar


REQUIRED_COLUMNS = {
    "event_date",
    "event_timestamp",
    "event_datetime",
    "user_pseudo_id",
    "session_id",
    "event_name",
    "country",
    "region",
    "city",
    "device_category",
    "traffic_source",
    "traffic_medium",
    "transaction_id",
    "purchase_revenue",
    "day_of_week",
    "day_name",
    "is_weekend",
}


FUNNEL_EVENTS = {
    "view_item",
    "add_to_cart",
    "begin_checkout",
    "purchase",
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("input_csv", type=Path)
    parser.add_argument("output_parquet", type=Path)
    return parser.parse_args()


def validate_columns(df: pd.DataFrame) -> None:
    missing = sorted(REQUIRED_COLUMNS - set(df.columns))
    if missing:
        raise ValueError(
            "Input is missing required columns: " + ", ".join(missing)
        )


def add_holidays(df: pd.DataFrame) -> pd.DataFrame:
    calendar = USFederalHolidayCalendar()

    start = df["event_date"].min()
    end = df["event_date"].max()

    holidays = calendar.holidays(
        start=start,
        end=end,
        return_name=True,
    )

    holiday_map = {
        date.normalize(): name
        for date, name in holidays.items()
    }

    normalized_dates = df["event_date"].dt.normalize()
    df["holiday_name"] = normalized_dates.map(holiday_map).fillna("")
    df["is_holiday"] = df["holiday_name"].ne("")

    return df


def prepare(df: pd.DataFrame) -> pd.DataFrame:
    validate_columns(df)

    df = df.copy()

    df["event_date"] = pd.to_datetime(
        df["event_date"],
        errors="raise",
    )

    df["event_datetime"] = pd.to_datetime(
        df["event_datetime"],
        errors="raise",
        utc=True,
    )

    df["event_timestamp"] = pd.to_numeric(
        df["event_timestamp"],
        errors="raise",
    ).astype("int64")

    df = df[df["event_name"].isin(FUNNEL_EVENTS)].copy()

    df = df[
        df["session_id"].notna()
        & df["event_timestamp"].notna()
    ].copy()

    for column in [
        "user_pseudo_id",
        "session_id",
        "event_name",
        "country",
        "region",
        "city",
        "device_category",
        "traffic_source",
        "traffic_medium",
        "transaction_id",
    ]:
        df[column] = df[column].fillna("").astype("string")

    if "item_id" not in df.columns:
        df["item_id"] = ""

    df["item_id"] = df["item_id"].fillna("").astype("string")

    df["purchase_revenue"] = pd.to_numeric(
        df["purchase_revenue"],
        errors="coerce",
    ).fillna(0.0)

    df["day_of_week"] = df["event_date"].dt.dayofweek.astype("int8")
    df["day_name"] = df["event_date"].dt.day_name()
    df["is_weekend"] = df["day_of_week"].isin([5, 6])

    df = add_holidays(df)

    columns = [
        "event_date",
        "event_timestamp",
        "event_datetime",
        "user_pseudo_id",
        "session_id",
        "event_name",
        "country",
        "region",
        "city",
        "device_category",
        "traffic_source",
        "traffic_medium",
        "item_id",
        "transaction_id",
        "purchase_revenue",
        "day_of_week",
        "day_name",
        "is_weekend",
        "is_holiday",
        "holiday_name",
    ]

    df = df[columns].sort_values(
        ["session_id", "event_timestamp"],
        kind="stable",
    )

    if df.empty:
        raise ValueError("Prepared dataset is empty.")

    return df


def main() -> None:
    args = parse_args()

    if not args.input_csv.exists():
        raise FileNotFoundError(args.input_csv)

    df = pd.read_csv(args.input_csv)
    prepared = prepare(df)

    args.output_parquet.parent.mkdir(parents=True, exist_ok=True)

    prepared.to_parquet(
        args.output_parquet,
        engine="pyarrow",
        compression="zstd",
        index=False,
    )

    sessions = prepared["session_id"].nunique()
    purchases = (
        prepared.loc[prepared["event_name"] == "purchase", "session_id"]
        .nunique()
    )

    print(f"Rows: {len(prepared):,}")
    print(f"Sessions: {sessions:,}")
    print(f"Purchase sessions: {purchases:,}")
    print(f"Saved: {args.output_parquet}")


if __name__ == "__main__":
    main()
