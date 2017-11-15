import React, { Component } from 'react';
import PropTypes from 'prop-types';
import Rnd from 'react-rnd';
import _ from 'lodash';
import ActionCable from 'actioncable';
import Immutable from 'immutable';

import MapWidgetData from './MapWidgetData';
import ChartWidgetData from './ChartWidgetData';

const chartStyle = {
  height: '100%',
  width: '100%',
}

class Widget extends Component {
  static propTypes = {
    actions: PropTypes.object.isRequired,
    widget: PropTypes.object,
    dashboard: PropTypes.object,
    title: PropTypes.string,
  };

  constructor(props) {
    super(props);
    this.state = {
      showLoader: true,
      draggable: false,
      widgetData: {},
      requestOptions: {},
    };
    Object.assign(this.state, this.getPositioning());

    this.cable = null;
  }

  componentDidMount() {
    this.setZindex(this.state.z);
    this.subscribeChannel();
  }

  componentWillReceiveProps(nextProps) {
    if (nextProps.dashboard.getIn(['requestOptions', 'online'])) {
      const newRequestOptions = nextProps.dashboard.get('requestOptions');
      if (!_.isEqual(newRequestOptions, this.state.requestOptions)) {
        this.setState({ requestOptions: newRequestOptions });
        this.chanel.redraw();
      }
    }
  }

  componentWillUnmount() {
    const { widget } = this.props
    this.cable.subscriptions.remove({ channel: `${widget.get('_class_name')}Channel` });
  }

  subscribeChannel = () => {
    const { widget, dashboard, actions } = this.props
    const protocol = window.location.protocol === 'https:' ? 'wss://' : 'ws://';
    const cableUrl = `${protocol}${window.location.hostname}:${window.location.port}/cable`;
    this.cable = ActionCable.createConsumer(cableUrl);

    this.chanel = this.cable.subscriptions.create({
      channel: `${widget.get('_class_name')}Channel`,
      widget,
    }, {
      connected: () => {
        console.log('WS connected');
      },
      disconnected: () => {
        console.log('WS disconnected');
      },
      redraw: () => {
        console.log('WS redraw');
        this.chanel.perform('redraw', { widget });
      },
      rejected: () => {
        console.log('WS rejected');
      },
      received: (data) => {
        console.log('WS dataReceived(Immutable.fromJS(data)', Immutable.fromJS(data));
        this.setState({ showLoader: false, widgetData: data });
      },
    });
  }

  removeWidget = (event) => {
    const { dashboard, actions, widget } = this.props

    if (event) {
      event.preventDefault();
    }
    const result = confirm('Do you really want to remove this Widget ?');
    if (result) {
      actions.deleteWidget(dashboard, widget)
    }
  }

  // dimensions/position related stuff

  updateZIndex = (event) => {
    const { dashboard, widget: currentWidget } = this.props
    if (event) {
      event.preventDefault();
    }
    let maxZ = currentWidget.get('z');
    const currentWidgetId = currentWidget.get('id')
    dashboard.get('widgets').map((widget, index) => {
      if (maxZ <= widget.get('z') && currentWidgetId !== widget.get('id')) {
        maxZ = widget.get('z') + 1
      }
    });
    this.setZindex(maxZ);
  }

  saveSize = (event, direction, refToElement) => {
    if (this.state.expanded) {
      return;
    }
    this.updateServerPositionAndSize({}, { size_x: refToElement.style.width, size_y: refToElement.style.height }, {}, {});
  }

  savePosition = (event, data) => {
    if (this.state.expanded) {
      return;
    }
    this.updateServerPositionAndSize({ pos_x: data.x, pos_y: data.y }, {}, { z_index: this.rnd.state.z }, {});
  }

  toggleWidgetSize = (event) => {
    if (event) {
      event.preventDefault();
    }
    const { expanded } = this.state
    const { dashboard, width, height, x, y } = this.props
    const dashWidth = dashboard.get('width');
    const dashHeight = dashboard.get('height');
    if (!expanded) {
      this.setState({ x: 0, y: 0, width: dashWidth, height: dashHeight, expanded: !expanded })
    } else {
      this.setState({ x, y, width, height, expanded: !expanded })

    }
    this.updateServerPositionAndSize({}, {}, {}, { expanded: !expanded });
  }

  updateServerPositionAndSize = (position, size, z, expanded) => {
    const {
      props: { dashboard, actions, widget },
    } = this
    const params = Object.assign({}, position, size, z, expanded);
    actions.updateWidget(dashboard, widget, params)
  }

  setZindex = (z) => {
    this.rnd.updateZIndex(z);
  }

  getPositioning = () => {
    let { x, y, width, height } = this.props;
    const { z, expanded, offsetWidth: dashHeight, offsetHeight: dashWidth, dashboard } = this.props
    const { fixDimension, rnd } = this

    if (expanded) {
      return { x: 0, y: 0, width: dashWidth, height: dashHeight, z, expanded }
    }

    const newX = fixDimension(dashWidth, width, x);
    const newY = fixDimension(dashHeight, height, y);
    width = newX.widgetSize;
    x = newX.widgetPos;
    height = newY.widgetSize;
    y = newY.widgetPos;

    if (rnd) {
      rnd.updateSize({ width, height });
      rnd.updatePosition({ x, y });
    }
    return { x, y, width, height, z, expanded }
  }

  fixDimension = (dashSize, size, position) => {
    let widgetSize = size
    let widgetPos = position
    if (dashSize < (widgetPos + widgetSize)) { // check if widget is out of dashboard
      if (Math.floor(dashSize / 2) < widgetSize) { // if widget occupy > half of dash dimension, make it smaller
        widgetSize = Math.floor(dashSize / 2)
      }
      // stick widget to the right
      widgetPos = dashSize - widgetSize
    }
    return { widgetSize, widgetPos }
  }

  toggleDragging = (event) => {
    let draggable = false;
    if (event.type === 'mouseenter') {
      draggable = true
    }
    this.setState({ draggable });
  }

  isAMap = () => this.props.widget.get('title') === 'Map'

  render() {
    const {
      props: { actions, dashboard, widget, title },
      state: { x, y, width, height, expanded, widgetData, draggable, showLoader },
      toggleDragging, isAMap, updateZIndex, savePosition, saveSize, toggleWidgetSize, removeWidget,
    } = this

    const isMap = isAMap()
    const defaultRndSettings = { x, y, width, height, className: 'dashboard__diagram__container' }

    const widgetContent = isMap
      ? <MapWidgetData />
      : <ChartWidgetData
        style={chartStyle}
        actions={actions}
        widget={widget}
        widgetData={widgetData}
        dashboard={dashboard}
      />

    return (
      <div>
        <Rnd ref={c => this.rnd = c }
          default={defaultRndSettings}
          disableDragging={!draggable}
          bounds={'#widgetsWrapper'}
          minWidth={350}
          minHeight={350}
          onDragStart={updateZIndex}
          onDragStop={savePosition}
          onResizeStop={saveSize}
        >
          <div className="dashboard__diagram__container">
            <div
              className="dashboard__diagram__top"
              onMouseEnter={toggleDragging}
              onMouseLeave={toggleDragging}
            >
              {title}
              <i className="fa fa-window-restore hide__diagram__top" onClick={toggleWidgetSize} />
              <span className="close__diagram__top" onClick={removeWidget} />
            </div>
            <div
              className={showLoader ? 'dashboard__diagram withLoader' : 'dashboard__diagram'}
              onMouseEnter={!isMap && toggleDragging}
              onMouseLeave={toggleDragging}
            >
              {widgetContent}
            </div>
          </div>
        </Rnd>
      </div>
    )
  }
}

export default Widget
