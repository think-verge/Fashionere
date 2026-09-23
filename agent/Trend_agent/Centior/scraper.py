import pandas as pd
import time
from pytrends.request import TrendReq
from pytrends.exceptions import TooManyRequestsError
import matplotlib.pyplot as plt

# 1. Initialize the connection to Google
# hl specifies the language, tz is the timezone offset
pytrends = TrendReq(
    hl='en-US',
    tz=360,
    timeout=(10, 25),
)

# 2. Define your fashion keywords (you can compare up to 5 terms at a time)
kw_list = ["baggy jeans",  "Black Turtlenecks"]

try:
    # 3. Build the payload
    # cat=0 (All categories), timeframe='today 5-y' (last 5 years), geo='' (Worldwide)
    # To narrow it to the US, you would use geo='US'
    time.sleep(10)
    pytrends.build_payload(kw_list, cat=0, timeframe='today 5-y', geo='')

    # 4. Fetch the Interest Over Time data
    trends_df = pytrends.interest_over_time()
except TooManyRequestsError:
    print("Google Trends rate-limited this request with error 429.")
    print("Wait 10-30 minutes, then run the script again. Avoid running it many times quickly.")
    trends_df = pd.DataFrame()
except TypeError as error:
    print(f"pytrends failed because of a package version mismatch: {error}")
    print("Run this to fix the package versions:")
    print("pip install --upgrade pytrends urllib3")
    trends_df = pd.DataFrame()

# 5. Clean up the DataFrame
if not trends_df.empty:
    # Google includes an 'isPartial' column which we can drop for clarity
    trends_df = trends_df.drop(labels=['isPartial'], axis='columns', errors='ignore')
    
    print(trends_df.head())

    # 6. Plot the data to visualize the trend shift
    trends_df.plot(figsize=(10, 6), title='Baggy Jeans vs Black Turtlenecks (Last 5 Years)')
    plt.xlabel('Date')
    plt.ylabel('Search Interest (0-100)')
    plt.grid(True)
    plt.show()
else:
    print("No data returned. You might be rate-limited or the terms have zero volume.")
