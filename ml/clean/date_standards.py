"""Date standardization module.

Standardizes diverse date and timestamp formats into normalized Year-Month periods.
"""

from datetime import datetime, timezone
import re
from typing import Optional, Tuple


def standardize_date(date_str: Optional[str]) -> Tuple[Optional[datetime], Optional[str]]:
    """Standardizes date/timestamp into (datetime_object, 'YYYY-MM').
    
    Returns (None, None) if parsing fails.
    """
    if not date_str or not isinstance(date_str, str):
        return None, None

    s = date_str.strip()
    if not s:
        return None, None

    dt: Optional[datetime] = None

    # Format: 2023-11-30 or 2023-11-30T...
    if re.match(r"^\d{4}-\d{2}-\d{2}", s):
        try:
            dt = datetime.fromisoformat(s[:10])
        except Exception:
            pass

    # Format: 2023-12-01 09:14:39 +0000
    if dt is None and re.match(r"^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}", s):
        try:
            dt = datetime.strptime(s[:19], "%Y-%m-%d %H:%M:%S")
        except Exception:
            pass

    # Format: 20231201
    if dt is None and re.match(r"^\d{8}$", s):
        try:
            dt = datetime.strptime(s, "%Y%m%d")
        except Exception:
            pass

    # Format: Dec 2023 or December 2023
    if dt is None and re.match(r"^[A-Za-z]+ \d{4}$", s):
        for fmt in ["%b %Y", "%B %Y"]:
            try:
                dt = datetime.strptime(s, fmt)
                break
            except Exception:
                pass

    if dt is not None:
        year_month = dt.strftime("%Y-%m")
        return dt, year_month

    return None, None
