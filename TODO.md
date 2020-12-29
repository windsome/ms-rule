## 后续事情
1. mongodb 备份
2. nodejs 日志保存问题
2. 权限系统(不能每个人都能删东西)
3. 推送(弹幕,直播等)
4. 注意cookie中是否存token字段用以解析用户信息. 注意token和session优先级,建议token优先,若无ctx.state,则将session中填进去.