@AGENTS.md

## 缓存清理

修改本项目源码（包括但不限于：组件、配置、依赖版本、Next.js 配置）后，必须在重启 dev server 前清理 `.next` 缓存目录（尽量AI最后直接执行）：

```bash
rm -rf .next
```

否则旧缓存会导致改动不生效或出现诡异 bug。如果还有问题，再清理 `node_modules/.cache`。
## git commit要求
采用git convention规范