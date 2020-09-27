import React from 'react'
import Select from 'react-select'
import ReactModal from "react-modal";
import { default as ReactTable } from "react-table"
import { PieChart, Pie, Cell, Tooltip , Legend} from "recharts";
import FileSaver from "file-saver";
import XLSX from 'xlsx'
import update from "immutability-helper/index";

import dictionary from '../constants/fields/master_fields.yaml'


/* generate a download */
function s2ab(s) {
  var buf = new ArrayBuffer(s.length);
  var view = new Uint8Array(buf);
  for (var i=0; i!=s.length; ++i) {
    view[i] = s.charCodeAt(i) & 0xFF;
  }
  return buf;
}


function flattenJSON(data) {

  let flattenedJSON = []

  for (let i =  0; i < data.length; i ++) {
    let newRow = {}
    for (let item in data[i]){
      if (typeof data[i][item] === "object") {
        if (data[i][item] && data[i][item].constructor === Array) {
          newRow[item] = data[i][item].join("; ")
        } else if (data[i][item]) {
          newRow[item] = flattenJSON(data[i][item])
        }
      } else {
        newRow[item] = data[i][item]
      }
    }

    flattenedJSON.push(newRow)
  }

  return flattenedJSON

}

class DataDictionary extends React.Component {
  constructor (props: Object) {
    super(props)

    const nounList = {
      'animal': 'Animal & Veterinary',
      'drug': 'Human Drug',
      'device': 'Device',
      'food': 'Food',
      'other': 'Other',
      'tobacco': 'Tobacco'
    }

    const endpointList = {
      'event': 'Event',
      'label': 'Label',
      'classification': 'Classification',
      'ndc': 'NDC',
      'problem': 'Problem',
      'clearance': 'Clearance',
      'enforcement': 'Enforcement',
      'nsde': 'NSDE',
      'drugsfda': 'Drugs@FDA',
      'covid19serology': 'COVID-19 Serology',
      'premarketapproval': 'Pre-Market Approval',
      'recall': 'Recall',
      'reglist': 'Registration List',
      'udi': 'UDI'
    }



    let nouns = []
    let endpoint_columns = {}
    let endpoint_options = {}
    Object.keys(dictionary).forEach(function (noun) {
      nouns.push({'label': nounList[noun],'value': noun})
      endpoint_columns[noun] = []
      endpoint_options[noun] = []
      Object.keys(dictionary[noun]).forEach(function (endpoint) {
        endpoint_columns[noun].push({'Header': endpointList[endpoint],'accessor': endpoint})
        endpoint_options[noun].push({'label': endpointList[endpoint],'value': endpoint})
      })
    })

    // console.log("nouns: ", nouns)
    // console.log("columns: ", endpoint_columns, "options: ", endpoint_options)

    this.state = {
      colors: ["#0088FE", "#1ECFFF", "#00C49F", "#FFBB28", "#d62728"],
      columns: [
        {
          'Header': 'Field Name',
          'accessor': 'field_name'
        },
        {
          'Header': 'Datatype',
          'accessor': 'datatype'
        },
        {
          'Header': 'Datasets',
          'accessor': 'dataset_number'
        },
        {
          'Header': 'Definition',
          'accessor': 'definition'
        },
      ],
      data: [],
      pieData: [],
      modalRows: [],
      modalColumns: [],
      endpoint_columns: endpoint_columns,
      endpointOptions: endpoint_options,
      nouns: nouns,
      pageSize: 25,
      selectedRow: {},
      selectedNoun: nouns[0],
      selectedEndpoint: [],
      resized: [],
      sorted: [],
      filtered: []
    }

    this.handleNounChange = this.handleNounChange.bind(this)
    this.handleEndpointChange = this.handleEndpointChange.bind(this)
    this.getData = this.getData.bind(this)
    this.getObject = this.getObject.bind(this)
    this.getNestedValue = this.getNestedValue.bind(this)
    this.exportToXLS = this.exportToXLS.bind(this)
    this.openModal = this.openModal.bind(this)
    this.closeModal = this.closeModal.bind(this)
    this.getModalData = this.getModalData.bind(this)
  }

  componentDidMount () {
    this.handleNounChange(this.state.selectedNoun)
  }

/*  componentDidUpdate (prevProps, prevState) {
    if (prevState.selectedNoun !== this.state.selectedNoun) {
      this.getData()
    }
  }*/

  getModalData(rowInfo) {
    let col_list = []
    let columns = []

    let data = {}

    // console.log("endpoints: ", this.state.endpoint_columns)

    this.state.endpoint_columns[this.state.selectedNoun['value']].forEach((endpoint) => {
      // console.log("endpoint: ", endpoint)
      let endpoint_name = endpoint['Header']
      let endpoint_value = endpoint['accessor']
      // console.log("datasets: ", rowInfo['datasets'], endpoint_value)
      if (rowInfo['datasets'].includes(endpoint_value)) {
        // console.log("rowInfo datasets: ", rowInfo['datasets'], "endpoint_name: ", endpoint_name)
        data[endpoint_value] = true
      }
      // console.log("data: ", data)
      if (col_list.indexOf(endpoint_value) === -1) {
        columns.push({
          Header: endpoint_name,
          accessor: endpoint_value,
          Cell: row => (
            <div className='checkbox-cell'>{row.value ? <i className="fa fa-2x fa-check" style={{color: "green"}}/>: <span/>}</div>
          )
        })
        col_list.push(endpoint_value)
      }
    })

    // console.log("col_list: ", col_list)
    // console.log("data: ", data, "columns: ", columns)
    this.setState({
      modalColumns: columns,
      modalRows: [data]
    })
  }

  closeModal () {
    this.setState({
      showModal: false
    })
  }

  openModal (row) {
    // console.log("modal open: ", row)
    this.getModalData(row)
    this.setState({
      selectedRow: row,
      showModal: true
    })
  }

  handleNounChange (val) {
    // console.log("noun val :", val)
    // console.log("endpoint options: ", this.state.endpointOptions[val['value']])
    this.setState({
      selectedNoun: val,
      selectedEndpoint: this.state.endpointOptions[val['value']]
    }, () => {
      this.getData()
    })
  }

  handleEndpointChange (val) {
    // console.log("endpoint val :", val)
    this.setState({
      selectedEndpoint: val
    }, () => {
      this.getData()
    })
  }

  getNestedValue(rowObj, path) {
    var props = path.split('.');
    props.forEach(function(prop){
      if (rowObj) {
        rowObj = rowObj[prop];
      }
    })
    return rowObj;
  }

  exportToXLS() {
    try {

      /* export only visible columns */
      var columns = []
      this.state.columns.forEach(function(column) {
        columns.push(column.accessor)
      })

      var exportableRows = []
      this.state.data.forEach((row) => {
        var truncatedRow = {}
        var rowData = ""
        columns.forEach((column) => {
          var columnValue = this.getNestedValue(row, column)
          truncatedRow[column] = columnValue
          rowData += columnValue ? columnValue : ""
        })
        if(rowData) {
          exportableRows.push(truncatedRow)
        }
      })

      /* make the worksheet */
      var ws = XLSX.utils.json_to_sheet(flattenJSON(exportableRows));

      /* add to workbook */
      var wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "data");

      /* write workbook (use type 'binary') */
      var wbout = XLSX.write(wb, {bookType:'xlsx', type:'binary'});

      FileSaver.saveAs(new Blob([s2ab(wbout)],{type:"application/octet-stream"}), this.state.selectedNoun.label + ".xlsx");
    } catch (err) {
      console.error(err);
    }
  }

  getObject(data, parent_name, parent_obj, endpoint) {
    Object.keys(parent_obj).forEach(function (val) {
      let val_name = parent_name + '.' + val
      //console.log('val_name', val_name)
      //console.log('val: ', val)
      if(!data.hasOwnProperty(val_name) && parent_obj[val].hasOwnProperty('items')) {
        data[val_name] = {
          'dataset': [endpoint],
          'definition': parent_obj[val]['items']['description'],
          'type': 'array of ' + parent_obj[val]['items']['type'] + 's'
        }
      } else if(!data.hasOwnProperty(val_name) && !parent_obj[val].hasOwnProperty('items')) {
        data[val_name] = {
          'dataset': [endpoint],
          'definition': parent_obj[val]['description'],
          'type': parent_obj[val]['type']
        }
      } else {
        data[val_name]['dataset'].push(endpoint)
      }
    })
  }

  getData () {
    let data = {}
    let noun = this.state.selectedNoun['value']
    this.state.selectedEndpoint.forEach((endpoint) => {
      // console.log('endpoints: ', endpoint)
      // console.log('selected endpoint: ', this.state.selectedEndpoint)
      //if () { continue }
      Object.keys(dictionary[noun][endpoint['value']]['properties']).forEach((val) => {
        //console.log('val: ', val)
        if(dictionary[noun][endpoint['value']]['properties'][val]['type'] === 'object') {
          this.getObject(data, val, dictionary[noun][endpoint['value']]['properties'][val]['properties'], endpoint['value'])
        }
        else if(!data.hasOwnProperty(val) && dictionary[noun][endpoint['value']]['properties'][val].hasOwnProperty('items')) {
          data[val] = {
            'dataset': [endpoint['value']],
            'definition': dictionary[noun][endpoint['value']]['properties'][val]['items']['description'],
            'type': 'array of ' + dictionary[noun][endpoint['value']]['properties'][val]['items']['type'] + 's'
          }
        } else if(!data.hasOwnProperty(val) && !dictionary[noun][endpoint['value']]['properties'][val].hasOwnProperty('items')) {
          data[val] = {
            'dataset': [endpoint['value']],
            'definition': dictionary[noun][endpoint['value']]['properties'][val]['description'],
            'type': dictionary[noun][endpoint['value']]['properties'][val]['type']
          }
        } else {
          data[val]['dataset'].push(endpoint['value'])
        }
      })
    })
    // console.log('data: ', data)
    let data_array = []
    Object.keys(data).forEach((field) => {
      data_array.push({
        'field_name': field,
        'datasets': data[field]['dataset'],
        'datatype': data[field]['type'],
        'dataset_number': data[field]['dataset'].length,
        'definition': data[field]['definition']
      })
    })
    data_array.sort((a, b) => (a.dataset_number < b.dataset_number) ? 1 : (a.dataset_number === b.dataset_number) ? ((a.field_name > b.field_name) ? 1 : -1) : -1 )
    // console.log("data array: ", data_array)
    let pieData = []
    for (let i=0; i<5; i++) {
      // console.log("i: ", i)
      pieData.push({
        'name': data_array[i]['field_name'],
        'value': data_array[i]['dataset_number']
      })
    }
    // console.log("pie data: ", pieData)
    this.setState({
      'data': data_array,
      'pieData': pieData
    })
  }

  render () {

    if(this.state.data === undefined){
      return (<span/>)
    }

    // if (Object.keys(this.state.data).length === 0 && this.state.data.constructor === Object) {
    //   return <span/>
    // }

    //console.log("selected: ", this.state.selectedNoun)

    let data = this.state.data
    let searchText = this.state.search

    if (searchText) {
      let regex = new RegExp( searchText, "i")
      data = data.filter(row => {
        for (let i = 0; i < this.state.columns.length; i++) {
          if (regex.test(String(this.getNestedValue(row, this.state.columns[i].accessor)))) {
            //console.log("true: ", this.getNestedValue(row, this.state.columns[i].accessor))
            return true
          }
        }
        return false
      })
    }

    // console.log("endpoints list: ", this.state.endpoint_columns[this.state.selectedNoun['value']])
    // console.log("endpoint options: ", this.state.endpointOptions[this.state.selectedNoun['value']])
    // console.log("endpoint select: ", this.state.selectedEndpoint)

    return (
      <section id='data-dictionary'>
        <ReactModal
          isOpen={this.state.showModal}
          className='help-window'
          overlayClassName='modal-overlay'
          contentLabel="Help Modal"
          onRequestClose={this.closeModal}
          shouldCloseOnOverlayClick={true}
          ariaHideApp={false}
        >
          <h3>{this.state.selectedRow['field_name']} <span>({this.state.selectedRow['datatype']})</span></h3>
          <h4>Definition</h4>
          <p>{this.state.selectedRow['definition']}</p>
          <div style={{margin: '20px'}}>
            <ReactTable
              data={this.state.modalRows}
              minRows={0}
              columns={this.state.modalColumns}
              className="-striped -highlight"
              showPagination={false}
              resizable={false}
            />
          </div>
        </ReactModal>
        <div className='nouns' id='nouns'>
          <Select
            clearable={false}
            name='toggle'
            options={this.state.nouns}
            onChange={this.handleNounChange}
            placeholder='Select Category'
            aria-label='Select Category'
            resetValue='label'
            value={this.state.selectedNoun}
          />
        </div>
        <div>
          <h3>Usage Summary</h3>
          <div>
            <h4>{this.state.selectedNoun['label']} API Calls</h4>

          </div>
          <div>
            <PieChart
              width={250}
              height={250}
            >
              <Pie
                ref="interactivePie"
                dataKey="value"
                data={this.state.pieData}
                innerRadius={60}
                outerRadius={80}
              >
                {
                  this.state.pieData.map((entry, index) => <Cell key={index} fill={ this.state.colors[index % this.state.colors.length] } />)
                }
              </Pie>
              <Tooltip/>
            </PieChart>
            <div>
              <h4>Top 5 Common Fields in {this.state.selectedNoun['label']}</h4>
              <ul style={{position: "relative"}}>
                {
                  this.state.pieData.map((entry, index) =>
                    <li key={index}><span className='color-box' style={{backgroundColor: this.state.colors[index]}}/>{entry['name']}</li>)
                }
              </ul>
            </div>
          </div>
        </div>
        <div className='endpoints' id='endpoints'>
          <Select
            name='endpoints'
            //clearable
            isMulti
            options={this.state.endpointOptions[this.state.selectedNoun['value']]}
            onChange={this.handleEndpointChange}
            // placeholder='Select Endpoints'
            // aria-label='Select Endpoints'
            className="basic-multi-select"
            classNamePrefix="select"
            value={this.state.selectedEndpoint}
            //defaultValue={this.state.endpointOptions[this.state.selectedNoun['value']]}
          />
        </div>
        <div className='dataset-table-menubar' style={{paddingBottom: 0, padding: 5}}>
          <div style={{width: "67%"}}>
            <span style={{width:"10em", padding: 10}}>{data.length} Fields</span>
            <input className='search-input' onChange={e => this.setState({search: e.target.value})}
                   placeholder="Type to Search in Results..." type="search" autoFocus
            />

            <a href='javascript:void(0)' onClick={this.exportToXLS} style={{ position: "absolute", right:30, lineHeight: 2.5, display: "inline"}} >
              <img alt='Export to XLS' style={{float: "left", width: 31, padding: 5}}
                   src='/img/xls-icon.svg'/>Export to XLS
            </a>

            {/*<a href='javascript:void(0)' onClick={this.exportToCSV} style={{ position: "absolute", right:160, lineHeight: 2.5, display: "inline"}} >
                    <img alt='Export to CSV' style={{float: "left", width: 31, padding: 5}}
                         src='/img/csv-icon.svg'/>Export to CSV
                </a>*/}

          </div>
        </div>
        <ReactTable
          data={data}
          getTrProps={(state, rowInfo, column, instance) => {
            return {
              onClick: () => this.openModal(rowInfo['row']['_original'])
            }
          }}
          columns={this.state.columns}
          pageSize={this.state.pageSize}
          pageSizeOptions={[10, 25, 50, 100, 200, 250, 500, 1000]}
          showPagination={true}
          showPaginationTop={true}
          minRows={10}
          className="-striped -highlight"
          filtered={this.state.filtered}
          resized={this.state.resized}
          onSortedChange={sorted => this.setState({ sorted })}
          onPageChange={page => this.setState({ page })}
          onPageSizeChange={(pageSize, page) =>
            this.setState({ page, pageSize })}
          onResizedChange={resized => this.setState({ resized })}
          onFilteredChange={filtered => this.setState({ filtered })}
          style={{
            width: '100%',
            height: '494px',
            position: 'relative'
          }}
        />
      </section>
    )
  }
}


export default DataDictionary