# io-overwatch


```
node overwatch.js dir  \
	--logging.file=./overwatch.log \
	--monitor.dir=/tmp/bitsofinfo \
	--monitor.stabilityThreshold=1000 \
	--evaluator.events=change \
	--evaluator.regex=".*test1.*" \
	--evaluator.reactors=mkdir moveAll sqlInsert \
	--reactor.mkdir.target=/tmp/{{{ioEvent.context.timestamp}}}/bitsofinfo_target \
	--reactor.moveAll.target=/tmp/{{{ioEvent.context.timestamp}}}/bitsofinfo_target \
	--reactor.sqlInsert.table=io_event \
    --reactor.sqlInsert.columns=eventType fullPath filename parentPath timestamp uuid \
	--reactor.sqlInsert.values="{{{ioEvent.eventType}}}" "{{{ioEvent.fullPath}}}" "{{{ioEvent.filename}}}" "{{{ioEvent.parentPath}}}" "{{{ioEvent.context.timestamp}}}" "{{{ioEvent.uuid}}}"\
	--reactor.db.host=localhost \
	--reactor.db.user=root \
	--reactor.db.pw=root \
	--reactor.db.name=io_event_reactor
```


```
node overwatch.js dir  \
	--logging.file=./overwatch.log \
	--monitor.dir=/tmp/bitsofinfo \
	--monitor.stabilityThreshold=1000 \
	--evaluator.events=add change \
	--evaluator.regex=".*test1.zip" \
	--evaluator.reactors=mkdir extractFileTo moveAll sqlInsert \
	--reactor.mkdir.target=/tmp/{{{ioEvent.context.timestamp}}}/{{{ioEvent.parentName}}}/bitsofinfo_target \
	--reactor.extractFileTo.target=/tmp/{{{ioEvent.context.timestamp}}}//{{{ioEvent.parentName}}}/bitsofinfo_target \
	--reactor.moveAll.target=/tmp/{{{ioEvent.context.timestamp}}}/bitsofinfo_target \
	--reactor.sqlInsert.table=io_event \
	--reactor.sqlInsert.columns=eventType fullPath filename parentPath timestamp uuid \
	--reactor.sqlInsert.values="{{{ioEvent.eventType}}}" "{{{ioEvent.fullPath}}}" "{{{ioEvent.filename}}}" "{{{ioEvent.parentPath}}}" "{{{ioEvent.context.timestamp}}}" "{{{ioEvent.uuid}}}"\
	--reactor.db.host=localhost \
	--reactor.db.user=root \
	--reactor.db.pw=root \
	--reactor.db.name=io_event_reactor
```
