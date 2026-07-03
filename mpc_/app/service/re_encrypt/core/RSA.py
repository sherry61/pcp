from Crypto.PublicKey import RSA
from Crypto.Cipher import PKCS1_OAEP
import os

from ..util import KEYS_DIR

def get_secret():
    return 'sample-secret'

def generate_keys():
    cipher = RSA.generate(3072)
    priv = cipher.export_key(
            passphrase=get_secret(),
            pkcs=8,
            protection='PBKDF2WithHMAC-SHA512AndAES256-CBC',
            prot_params={'iteration_count':131072}
        )
    pub = cipher.public_key().export_key()
    return priv, pub

def generate_keys_file(filebase):
    priv, pub = generate_keys()
    filebase_path = os.path.join(KEYS_DIR, filebase)
    if not os.path.exists(filebase_path):
        os.makedirs(filebase_path)
    with open(os.path.join(filebase_path, 'key.pem'), 'wb') as fo:
        fo.write(priv)
    with open(os.path.join(filebase_path, 'key.pub'), 'wb') as fo:
        fo.write(pub)
    return pub

def encrypt(pub, msg):
    k = RSA.importKey(pub)
    cipher = PKCS1_OAEP.new(k)
    return cipher.encrypt(msg)

def encrypt_file(keyfile, filein, fileout):
    with open(keyfile, 'rb') as fi:
        key = fi.read()
    with open(filein, 'rb') as fi:
        msg = fi.read()
    cipher_text = encrypt(key, msg)
    with open(fileout, 'wb') as fo:
        fo.write(cipher_text)
    
        
def decrypt_file(keyfile, filein, fileout):
    with open(keyfile, 'rb') as fi:
        key = fi.read()
    with open(filein, 'rb') as fi:
        cipher_text = fi.read()
    msg = _decrypt(key, cipher_text)
    with open(fileout, 'wb') as fo:
        fo.write(msg)

def _decrypt(priv, ciph):
    k = RSA.importKey(priv, get_secret())
    cipher = PKCS1_OAEP.new(k)
    return cipher.decrypt(ciph)
