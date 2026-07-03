from Crypto.Cipher import AES
from Crypto.Hash import HMAC, SHA256
from Crypto.Random import get_random_bytes

def generate_key():
    aes_key = get_random_bytes(16)
    hmac_key = get_random_bytes(16)
    return aes_key, hmac_key

def encrypt(key, msg):
    cipher = AES.new(key, AES.MODE_CTR, initial_value=0, nonce=bytes([0]))
    return cipher.encrypt(msg)

def decrypt(key, ciph):
    cipher = AES.new(key, AES.MODE_CTR, initial_value=0, nonce=bytes([0]))
    return cipher.decrypt(ciph)

def digest(key, msg):
    hmac = HMAC.new(key, digestmod=SHA256)
    return hmac.update(msg).digest()

def verify(key, hash, msg):
    hmac = HMAC.new(key, digestmod=SHA256)
    hmac.update(msg).verify(hash)