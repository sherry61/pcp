"""
同态加密算法实现模块:
- 密钥生成
- 加密
- 解密
- 同态加法
- 同态乘法（标量乘法）
"""

import random
import math
from typing import Tuple, Dict, Any


class PaillierCrypto:
    """Paillier同态加密系统实现"""

    def __init__(self, key_size: int = 1024):
        """
        初始化Paillier加密系统
        
        Args:
            key_size: 密钥长度，默认为1024位
        """
        self.key_size = key_size
        self.public_key = None
        self.private_key = None
    
    def generate_keys(self) -> Tuple[Dict[str, Any], Dict[str, Any]]:
        """
        生成公钥和私钥
        
        Returns:
            包含公钥和私钥的元组
        """
        # 生成两个大素数
        p = self._generate_prime(self.key_size // 2)
        q = self._generate_prime(self.key_size // 2)
        
        # 计算n = p * q
        n = p * q
        
        # 计算λ(n) = lcm(p-1, q-1)
        lambda_n = self._lcm(p - 1, q - 1)
        
        # 选择g，使得gcd(L(g^λ mod n^2), n) = 1
        g = n + 1  # 简化版本，g = n + 1 是一个有效的选择
        
        # 计算μ = (L(g^λ mod n^2))^(-1) mod n
        # 其中L(x) = (x - 1) / n
        g_lambda = pow(g, lambda_n, n * n)
        l_g_lambda = (g_lambda - 1) // n
        mu = self._mod_inverse(l_g_lambda, n)
        
        # 设置公钥和私钥
        self.public_key = {"n": n, "g": g}
        self.private_key = {"lambda": lambda_n, "mu": mu, "p": p, "q": q}
        
        return self.public_key, self.private_key
    
    def encrypt(self, plaintext: int, public_key: Dict[str, Any] = None) -> int:
        """
        加密明文
        
        Args:
            plaintext: 要加密的整数明文
            public_key: 公钥，如果为None则使用当前实例的公钥
            
        Returns:
            密文
        """
        if public_key is None:
            public_key = self.public_key
        
        if public_key is None:
            raise ValueError("公钥未设置，请先生成密钥或提供公钥")
        
        n = public_key["n"]
        g = public_key["g"]
        
        # 确保明文在有效范围内
        if plaintext < 0 or plaintext >= n:
            raise ValueError(f"明文必须在0到{n-1}之间")
        
        # 选择一个随机数r，满足gcd(r, n) = 1
        r = random.randint(1, n - 1)
        while math.gcd(r, n) != 1:
            r = random.randint(1, n - 1)
        
        # 计算密文 c = g^m * r^n mod n^2
        n_squared = n * n
        g_m = pow(g, plaintext, n_squared)
        r_n = pow(r, n, n_squared)
        ciphertext = (g_m * r_n) % n_squared
        
        return ciphertext
    
    def decrypt(self, ciphertext: int, private_key: Dict[str, Any] = None) -> int:
        """
        解密密文
        
        Args:
            ciphertext: 要解密的密文
            private_key: 私钥，如果为None则使用当前实例的私钥
            
        Returns:
            解密后的明文
        """
        if private_key is None:
            private_key = self.private_key
        
        if private_key is None or self.public_key is None:
            raise ValueError("密钥未设置，请先生成密钥或提供密钥")
        
        n = self.public_key["n"]
        lambda_n = private_key["lambda"]
        mu = private_key["mu"]
        
        # 计算明文 m = L(c^λ mod n^2) * μ mod n
        n_squared = n * n
        c_lambda = pow(ciphertext, lambda_n, n_squared)
        L_c_lambda = (c_lambda - 1) // n
        plaintext = (L_c_lambda * mu) % n
        
        return plaintext
    
    def homomorphic_add(self, ciphertext1: int, ciphertext2: int) -> int:
        """
        同态加法：E(m1) * E(m2) = E(m1 + m2)
        
        Args:
            ciphertext1: 第一个密文
            ciphertext2: 第二个密文
            
        Returns:
            加法结果的密文
        """
        if self.public_key is None:
            raise ValueError("公钥未设置，请先生成密钥或提供公钥")
        
        n = self.public_key["n"]
        n_squared = n * n
        
        # 计算 E(m1 + m2) = E(m1) * E(m2) mod n^2
        result = (ciphertext1 * ciphertext2) % n_squared
        
        return result
    
    def homomorphic_multiply(self, ciphertext: int, scalar: int) -> int:
        """
        同态乘法（标量乘法）：E(m)^k = E(m * k)
        
        Args:
            ciphertext: 密文
            scalar: 标量（明文整数）
            
        Returns:
            乘法结果的密文
        """
        if self.public_key is None:
            raise ValueError("公钥未设置，请先生成密钥或提供公钥")
        
        n = self.public_key["n"]
        n_squared = n * n
        
        # 计算 E(m * k) = E(m)^k mod n^2
        result = pow(ciphertext, scalar, n_squared)
        
        return result
    
    def _generate_prime(self, bits: int) -> int:
        """生成指定位数的素数"""
        # 在实际应用中，应使用更安全的素数生成方法
        # 这里使用Python的random模块简化实现
        while True:
            # 生成随机奇数
            p = random.getrandbits(bits) | 1
            # 简单的素性测试
            if self._is_prime(p):
                return p
    
    def _is_prime(self, n: int, k: int = 5) -> bool:
        """
        使用Miller-Rabin素性测试检查n是否为素数
        
        Args:
            n: 要测试的数
            k: 测试轮数，越大越可靠
            
        Returns:
            如果n可能是素数则返回True，否则返回False
        """
        if n <= 1:
            return False
        if n <= 3:
            return True
        if n % 2 == 0:
            return False
        
        # 将n-1表示为2^r * d形式，其中d是奇数
        r, d = 0, n - 1
        while d % 2 == 0:
            r += 1
            d //= 2
        
        # 进行k轮Miller-Rabin测试
        for _ in range(k):
            a = random.randint(2, n - 2)
            x = pow(a, d, n)
            if x == 1 or x == n - 1:
                continue
            for _ in range(r - 1):
                x = pow(x, 2, n)
                if x == n - 1:
                    break
            else:
                return False
        return True
    
    def _gcd(self, a: int, b: int) -> int:
        """计算最大公约数"""
        while b:
            a, b = b, a % b
        return a
    
    def _lcm(self, a: int, b: int) -> int:
        """计算最小公倍数"""
        return a * b // self._gcd(a, b)
    
    def _extended_gcd(self, a: int, b: int) -> Tuple[int, int, int]:
        """
        扩展欧几里得算法
        
        Returns:
            (gcd, x, y)，满足ax + by = gcd
        """
        if a == 0:
            return b, 0, 1
        else:
            gcd, x1, y1 = self._extended_gcd(b % a, a)
            x = y1 - (b // a) * x1
            y = x1
            return gcd, x, y
    
    def _mod_inverse(self, a: int, m: int) -> int:
        """
        计算a在模m下的乘法逆元
        
        Args:
            a: 要求逆元的数
            m: 模数
            
        Returns:
            a在模m下的乘法逆元
        """
        gcd, x, y = self._extended_gcd(a, m)
        if gcd != 1:
            raise ValueError(f"{a}在模{m}下没有乘法逆元")
        else:
            return x % m


class ElGamalCrypto:
    """ElGamal同态加密系统实现（支持同态乘法）"""
    
    def __init__(self, key_size: int = 1024):
        """
        初始化ElGamal加密系统
        
        Args:
            key_size: 密钥长度，默认为1024位
        """
        self.key_size = key_size
        self.public_key = None
        self.private_key = None
    
    def generate_keys(self) -> Tuple[Dict[str, Any], Dict[str, Any]]:
        """
        生成公钥和私钥
        
        Returns:
            包含公钥和私钥的元组
        """
        # 生成一个大素数p
        p = self._generate_prime(self.key_size)
        
        # 选择一个生成元g
        g = self._find_generator(p)
        
        # 选择私钥x
        x = random.randint(2, p - 2)
        
        # 计算公钥y = g^x mod p
        y = pow(g, x, p)
        
        # 设置公钥和私钥
        self.public_key = {"p": p, "g": g, "y": y}
        self.private_key = {"x": x}
        
        return self.public_key, self.private_key
    
    def encrypt(self, plaintext: int, public_key: Dict[str, Any] = None) -> Tuple[int, int]:
        """
        加密明文
        
        Args:
            plaintext: 要加密的整数明文
            public_key: 公钥，如果为None则使用当前实例的公钥
            
        Returns:
            密文对(c1, c2)
        """
        if public_key is None:
            public_key = self.public_key
        
        if public_key is None:
            raise ValueError("公钥未设置，请先生成密钥或提供公钥")
        
        p = public_key["p"]
        g = public_key["g"]
        y = public_key["y"]
        
        # 确保明文在有效范围内
        if plaintext < 0 or plaintext >= p:
            raise ValueError(f"明文必须在0到{p-1}之间")
        
        # 选择一个随机数k
        k = random.randint(1, p - 2)
        
        # 计算密文对 (c1, c2)
        # c1 = g^k mod p
        # c2 = m * y^k mod p
        c1 = pow(g, k, p)
        c2 = (plaintext * pow(y, k, p)) % p
        
        return (c1, c2)
    
    def decrypt(self, ciphertext: Tuple[int, int], private_key: Dict[str, Any] = None) -> int:
        """
        解密密文
        
        Args:
            ciphertext: 要解密的密文对(c1, c2)
            private_key: 私钥，如果为None则使用当前实例的私钥
            
        Returns:
            解密后的明文
        """
        if private_key is None:
            private_key = self.private_key
        
        if private_key is None or self.public_key is None:
            raise ValueError("密钥未设置，请先生成密钥或提供密钥")
        
        c1, c2 = ciphertext
        p = self.public_key["p"]
        x = private_key["x"]
        
        # 计算s = c1^x mod p
        s = pow(c1, x, p)
        
        # 计算s的模p乘法逆元
        s_inv = self._mod_inverse(s, p)
        
        # 计算明文 m = c2 * s^(-1) mod p
        plaintext = (c2 * s_inv) % p
        
        return plaintext
    
    def homomorphic_multiply(self, ciphertext1: Tuple[int, int], ciphertext2: Tuple[int, int]) -> Tuple[int, int]:
        """
        同态乘法：E(m1) * E(m2) = E(m1 * m2)
        
        Args:
            ciphertext1: 第一个密文对(c1_1, c2_1)
            ciphertext2: 第二个密文对(c1_2, c2_2)
            
        Returns:
            乘法结果的密文对
        """
        if self.public_key is None:
            raise ValueError("公钥未设置，请先生成密钥或提供公钥")
        
        p = self.public_key["p"]
        
        c1_1, c2_1 = ciphertext1
        c1_2, c2_2 = ciphertext2
        
        # 计算 E(m1 * m2) = (c1_1 * c1_2, c2_1 * c2_2)
        result_c1 = (c1_1 * c1_2) % p
        result_c2 = (c2_1 * c2_2) % p
        
        return (result_c1, result_c2)
    
    def _generate_prime(self, bits: int) -> int:
        """生成指定位数的素数"""
        # 在实际应用中，应使用更安全的素数生成方法
        while True:
            # 生成随机奇数
            p = random.getrandbits(bits) | 1
            # 简单的素性测试
            if self._is_prime(p):
                return p
    
    def _is_prime(self, n: int, k: int = 5) -> bool:
        """
        使用Miller-Rabin素性测试检查n是否为素数
        
        Args:
            n: 要测试的数
            k: 测试轮数，越大越可靠
            
        Returns:
            如果n可能是素数则返回True，否则返回False
        """
        if n <= 1:
            return False
        if n <= 3:
            return True
        if n % 2 == 0:
            return False
        
        # 将n-1表示为2^r * d形式，其中d是奇数
        r, d = 0, n - 1
        while d % 2 == 0:
            r += 1
            d //= 2
        
        # 进行k轮Miller-Rabin测试
        for _ in range(k):
            a = random.randint(2, n - 2)
            x = pow(a, d, n)
            if x == 1 or x == n - 1:
                continue
            for _ in range(r - 1):
                x = pow(x, 2, n)
                if x == n - 1:
                    break
            else:
                return False
        return True
    
    def _find_generator(self, p: int) -> int:
        """
        为素数p找一个生成元
        
        Args:
            p: 素数
            
        Returns:
            p的一个生成元
        """
        # 简化实现，在实际应用中应使用更高效的方法
        for g in range(2, p):
            if self._is_generator(g, p):
                return g
        return 2  # 默认返回2，实际上应该继续寻找
    
    def _is_generator(self, g: int, p: int) -> bool:
        """
        检查g是否为p的生成元
        
        Args:
            g: 待检查的数
            p: 素数
            
        Returns:
            如果g是p的生成元则返回True，否则返回False
        """
        # 简化实现，只检查几个指数
        # 在实际应用中应该更全面地检查
        values = set()
        for i in range(1, min(100, p)):
            value = pow(g, i, p)
            if value in values:
                return False
            values.add(value)
        return True
    
    def _extended_gcd(self, a: int, b: int) -> Tuple[int, int, int]:
        """
        扩展欧几里得算法
        
        Returns:
            (gcd, x, y)，满足ax + by = gcd
        """
        if a == 0:
            return b, 0, 1
        else:
            gcd, x1, y1 = self._extended_gcd(b % a, a)
            x = y1 - (b // a) * x1
            y = x1
            return gcd, x, y
    
    def _mod_inverse(self, a: int, m: int) -> int:
        """
        计算a在模m下的乘法逆元
        
        Args:
            a: 要求逆元的数
            m: 模数
            
        Returns:
            a在模m下的乘法逆元
        """
        gcd, x, y = self._extended_gcd(a, m)
        if gcd != 1:
            raise ValueError(f"{a}在模{m}下没有乘法逆元")
        else:
            return x % m