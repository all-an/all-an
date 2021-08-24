package bytebank;

public class TestaMetodo {
	public static void main(String[] args) {
		Conta contaPaulo = new Conta();
		contaPaulo.saldo = 100;
		contaPaulo.deposita(50);
		
		System.out.println(contaPaulo.saldo);
		
		boolean conseguiuSacar = contaPaulo.saca(20);
		
		System.out.println(contaPaulo.saldo);
		
		System.out.println(conseguiuSacar);
		
		Conta contaMarcela = new Conta();
		contaMarcela.deposita(1000);
		
		boolean sucessoTransferencia = contaMarcela.transfere(300, contaPaulo);
		
		if( sucessoTransferencia ) {
			System.out.println("Sucesso");
		} else {
			System.out.println("Sem grana"); 
		}
		
		System.out.println(contaPaulo.saldo);
		System.out.println(contaMarcela.saldo);
		
		contaPaulo.titular = "Paulo Silveira";
		
		System.out.println(contaPaulo.titular);
		
	}
}
 