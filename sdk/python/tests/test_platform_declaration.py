"""
平台声明与系统版本明细的行为约定。

这套断言在四个语言的 SDK 里是同一份，改一处务必同步其余三处：
``sdk/rust/src/http.rs``、``sdk/typescript/tests/``、``sdk/vanilla-js/``。

只用标准库 ``unittest``，不引入测试依赖：``python -m unittest discover -s tests``。
"""

from __future__ import annotations

import unittest

from verhub_sdk._http import (
    MAX_PLATFORM_VERSION_LENGTH,
    BaseHttpClient,
    detect_platform,
    detect_platform_version,
    sanitize_platform_version,
)

BASE_URL = "https://example.com/api/v1"

#: 用错编码读 ``cmd /C ver`` 会得到的串：GBK 的「版本」被当成 UTF-8 解，
#: 首字节变成替换字符、次两字节恰好凑成一个合法的汉字。
MOJIBAKE = "Microsoft Windows [�汾 10.0.26200.8875]"


class SanitizeTest(unittest.TestCase):
    def test_strips_mojibake_but_keeps_the_version_number(self) -> None:
        cleaned = sanitize_platform_version(MOJIBAKE)
        self.assertEqual(cleaned, "Microsoft Windows [ 10.0.26200.8")
        # 进不了 latin-1 的值会让 httpx 在编码请求头时抛异常。
        cleaned.encode("latin-1")

    def test_folds_whitespace_and_trims(self) -> None:
        self.assertEqual(sanitize_platform_version("  ubuntu\t\n 24.04  "), "ubuntu 24.04")
        self.assertEqual(sanitize_platform_version("11"), "11")

    def test_truncates_to_the_server_limit(self) -> None:
        self.assertEqual(len(sanitize_platform_version("9" * 100)), MAX_PLATFORM_VERSION_LENGTH)

    def test_yields_empty_when_nothing_survives(self) -> None:
        self.assertEqual(sanitize_platform_version("版本"), "")
        self.assertEqual(sanitize_platform_version("   "), "")

    def test_removes_control_characters(self) -> None:
        """换行 / 回车若混进头值会构成响应头注入，必须一并清掉。"""
        cleaned = sanitize_platform_version("11\r\nX-Injected: 1")
        self.assertNotIn("\r", cleaned)
        self.assertNotIn("\n", cleaned)


class DeclarationTest(unittest.TestCase):
    def test_explicit_platform_keeps_auto_detected_version(self) -> None:
        client = BaseHttpClient(BASE_URL, platform="windows")
        self.assertEqual(client.platform, "windows")
        self.assertEqual(
            client.platform_version,
            detect_platform_version() or None,
            "指定平台后版本仍应自动探测并带上",
        )

    def test_auto_detects_both_when_nothing_given(self) -> None:
        client = BaseHttpClient(BASE_URL)
        self.assertEqual(client.platform, detect_platform())
        self.assertEqual(client.platform_version, detect_platform_version() or None)

    def test_explicit_version_wins_and_is_sanitized(self) -> None:
        client = BaseHttpClient(BASE_URL, platform_version="  Windows� 11  ")
        self.assertEqual(client.platform_version, "Windows 11")

    def test_platform_none_reports_nothing(self) -> None:
        """传 None 是明确的退出声明，版本一并不报。"""
        client = BaseHttpClient(BASE_URL, platform=None)
        self.assertIsNone(client.platform)
        self.assertIsNone(client.platform_version)

    def test_platform_none_still_honours_an_explicit_version(self) -> None:
        client = BaseHttpClient(BASE_URL, platform=None, platform_version="ubuntu 24.04")
        self.assertIsNone(client.platform)
        self.assertEqual(client.platform_version, "ubuntu 24.04")

    def test_setters_sanitize_too(self) -> None:
        client = BaseHttpClient(BASE_URL)
        client.set_platform_version(MOJIBAKE)
        self.assertEqual(client.platform_version, "Microsoft Windows [ 10.0.26200.8")
        client.set_platform_version("版本")
        self.assertIsNone(client.platform_version, "洗完是空串应收敛成 None")

    def test_detected_values_are_header_safe(self) -> None:
        """探测值会直接进请求头，必须是干净的可打印 ASCII。"""
        for value in (detect_platform(), detect_platform_version()):
            value.encode("latin-1")
            self.assertTrue(all(" " <= c <= "~" for c in value), repr(value))
        self.assertLessEqual(len(detect_platform_version()), MAX_PLATFORM_VERSION_LENGTH)


if __name__ == "__main__":
    unittest.main()
