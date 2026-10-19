"""Geography standardization module for Indian States, UTs, and Cities.

Maps arbitrary city and state names to ISO 3166-2:IN state codes and canonical state names.
"""

from typing import Dict, Optional, Tuple

# Canonical state code to official name mapping
STATE_CODES: Dict[str, str] = {
    "MH": "Maharashtra",
    "KA": "Karnataka",
    "TN": "Tamil Nadu",
    "DL": "Delhi",
    "HR": "Haryana",
    "UP": "Uttar Pradesh",
    "TG": "Telangana",
    "GJ": "Gujarat",
    "WB": "West Bengal",
    "RJ": "Rajasthan",
    "KL": "Kerala",
    "AP": "Andhra Pradesh",
    "MP": "Madhya Pradesh",
    "PB": "Punjab",
    "OR": "Odisha",
    "BR": "Bihar",
    "JH": "Jharkhand",
    "AS": "Assam",
    "UT": "Uttarakhand",
    "HP": "Himachal Pradesh",
}

# City to (State Code, State Name) mapping
CITY_TO_STATE: Dict[str, Tuple[str, str]] = {
    "mumbai": ("MH", "Maharashtra"),
    "pune": ("MH", "Maharashtra"),
    "nagpur": ("MH", "Maharashtra"),
    "nashik": ("MH", "Maharashtra"),
    "navi mumbai": ("MH", "Maharashtra"),
    "thane": ("MH", "Maharashtra"),
    "aurangabad": ("MH", "Maharashtra"),
    
    "bengaluru": ("KA", "Karnataka"),
    "bangalore": ("KA", "Karnataka"),
    "mysuru": ("KA", "Karnataka"),
    "mysore": ("KA", "Karnataka"),
    "hubli": ("KA", "Karnataka"),
    "mangalore": ("KA", "Karnataka"),
    
    "chennai": ("TN", "Tamil Nadu"),
    "coimbatore": ("TN", "Tamil Nadu"),
    "madurai": ("TN", "Tamil Nadu"),
    "tiruchirappalli": ("TN", "Tamil Nadu"),
    "salem": ("TN", "Tamil Nadu"),
    
    "delhi": ("DL", "Delhi"),
    "new delhi": ("DL", "Delhi"),
    
    "gurgaon": ("HR", "Haryana"),
    "gurugram": ("HR", "Haryana"),
    "faridabad": ("HR", "Haryana"),
    "panipat": ("HR", "Haryana"),
    "rohtak": ("HR", "Haryana"),
    
    "noida": ("UP", "Uttar Pradesh"),
    "greater noida": ("UP", "Uttar Pradesh"),
    "lucknow": ("UP", "Uttar Pradesh"),
    "kanpur": ("UP", "Uttar Pradesh"),
    "varanasi": ("UP", "Uttar Pradesh"),
    "agra": ("UP", "Uttar Pradesh"),
    "ghaziabad": ("UP", "Uttar Pradesh"),
    
    "hyderabad": ("TG", "Telangana"),
    "secunderabad": ("TG", "Telangana"),
    "warangal": ("TG", "Telangana"),
    
    "ahmedabad": ("GJ", "Gujarat"),
    "surat": ("GJ", "Gujarat"),
    "vadodara": ("GJ", "Gujarat"),
    "rajkot": ("GJ", "Gujarat"),
    
    "kolkata": ("WB", "West Bengal"),
    "howrah": ("WB", "West Bengal"),
    
    "jaipur": ("RJ", "Rajasthan"),
    "jodhpur": ("RJ", "Rajasthan"),
    "udaipur": ("RJ", "Rajasthan"),
    
    "kochi": ("KL", "Kerala"),
    "thiruvananthapuram": ("KL", "Kerala"),
    "trivandrum": ("KL", "Kerala"),
    
    "chandigarh": ("PB", "Punjab"),
    "indore": ("MP", "Madhya Pradesh"),
    "bhopal": ("MP", "Madhya Pradesh"),
    "bhubaneswar": ("OR", "Odisha"),
    "patna": ("BR", "Bihar"),
    "ranchi": ("JH", "Jharkhand"),
    "guwahati": ("AS", "Assam"),
    "dehradun": ("UT", "Uttarakhand"),
}


def standardize_geography(location_str: Optional[str]) -> Tuple[Optional[str], Optional[str]]:
    """Standardizes arbitrary city/state strings into (state_code, state_name).
    
    Returns (None, None) if unresolvable.
    """
    if not location_str or not isinstance(location_str, str):
        return None, None

    cleaned = location_str.strip().lower()
    if not cleaned:
        return None, None

    # Check direct code
    code_upper = cleaned.upper()
    if code_upper in STATE_CODES:
        return code_upper, STATE_CODES[code_upper]

    # Check state names directly
    for code, name in STATE_CODES.items():
        if name.lower() == cleaned or name.lower() in cleaned:
            return code, name

    # Check city tokens
    # E.g. "Mumbai, Maharashtra", "Bengaluru / Bangalore", "Gurgaon/Gurugram"
    for city, (code, name) in CITY_TO_STATE.items():
        if city in cleaned:
            return code, name

    return None, None
