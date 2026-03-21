# Verhub SDK (Python)

`VerhubSDK` Python 版本实现统一命名空间，并覆盖文档中心展示的 public + admin 接口。

当前版本：`0.1.0`

## 安装依赖

```bash
pip install requests
```

## 快速开始

```python
from verhub_sdk import VerhubSDK

sdk = VerhubSDK(base_url="https://api.example.com/api/v1", token="your-admin-token")

project = sdk.public_api.get_project_public_info("verhub")
created = sdk.admin_api.create_project("verhub", "Verhub")
```

## 命名空间

- `sdk.public_api` / `sdk.publicApi`: 公开接口
- `sdk.admin_api` / `sdk.adminApi`: 管理接口

## 鉴权

管理接口默认使用 Bearer Token。可通过以下方法设置：

- `sdk.set_token(token)`
- `sdk.clear_token()`

## 设计约定

- 所有方法使用显式参数，不使用泛化 `payload`。
- 所有方法提供参数注释，便于 IDE 自动提示。
