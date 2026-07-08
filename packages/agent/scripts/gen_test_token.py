from jose import jwt
import os
from datetime import datetime, timedelta

SECRET_KEY = os.getenv("JWT_SECRET_KEY", "testing_secret_key")
ALGORITHM = "HS256"

# Example payload
payload = {
    "sub": "test-user",  # subject, could be a username or user ID
    "exp": datetime.utcnow() + timedelta(hours=1)  # expires in 1 hour
}

token = jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)
print("JWT:", token)
