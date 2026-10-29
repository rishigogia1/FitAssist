import requests
import json
import time

base_url = 'http://localhost:8000/api/v1'

print('1. Getting token for new user...')
res = requests.post(f'{base_url}/auth/token', json={'email': 'test_new_onboarding@example.com'})
token = res.json()['access_token']
print(f'Token received: {token[:20]}...')

print('\n2. Fetching profile...')
res2 = requests.get(f'{base_url}/profile', headers={'Authorization': f'Bearer {token}'})
print(f'Profile status: {res2.status_code}')
if res2.status_code == 200:
    print(f'Profile data: {res2.json()}')
else:
    print(f'Error detail: {res2.text}')

print('\n3. Fetching dashboard...')
res3 = requests.get(f'{base_url}/dashboard', headers={'Authorization': f'Bearer {token}'})
print(f'Dashboard status: {res3.status_code}')
if res3.status_code == 200:
    data = res3.json()
    print(f'User: {data.get("user")}')
    print(f'Recommendation: {data.get("recommendation")}')
else:
    print(f'Error detail: {res3.text}')
