const config = {
  lang: "zh-CN",
  title: "Verhub 文档",
  base: '/Verhub/',
  description: "Verhub 版本与发布管理平台文档中心",
  cleanUrls: true,
  lastUpdated: true,
  themeConfig: {
    logo: {
      light: "/logo-light-500.png",
      dark: "/logo-dark-500.png"
    },
    nav: [
      { text: "首页", link: "/" },
      { text: "项目介绍", link: "/guide/introduction" },
      { text: "部署指南", link: "/guide/deployment" },
      { text: "开发指南", link: "/guide/development" },
      { text: "用户指南", link: "/guide/user-guide" },
      { text: "贡献指南", link: "/guide/contributing" }
    ],
    sidebar: [
      {
        text: "开始使用",
        items: [
          { text: "项目介绍", link: "/guide/introduction" },
          { text: "常见问题", link: "/guide/faq" }
        ]
      },
      {
        text: "部署与运维",
        items: [
          { text: "快速开始", link: "/guide/getting-started" },
          { text: "部署指南", link: "/guide/deployment" }
        ]
      },
      {
        text: "研发协作",
        items: [
          { text: "开发指南", link: "/guide/development" },
          { text: "贡献指南", link: "/guide/contributing" },
          { text: "用户指南", link: "/guide/user-guide" },
          { text: "架构概览", link: "/reference/architecture" }
        ]
      }
    ],
    socialLinks: [{ icon: "github", link: "https://github.com/IvanHanloth/verhub" }],
    search: {
      provider: "local"
    },
    footer: {
      message: "Released under the MIT License.",
      copyright: "Copyright © 2026 Verhub"
    }
  }
};

export default config;